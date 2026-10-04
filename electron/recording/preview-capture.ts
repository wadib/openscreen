import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import type { WebContents } from "electron";

export class RecordingPreviewCapture {
	private child: ChildProcessWithoutNullStreams;
	private stopped = false;
	private buffer = "";
	private killTimer: NodeJS.Timeout | undefined;
	constructor(
		helper: string,
		config: object,
		private owner: WebContents,
		private id: string,
	) {
		this.child = spawn(helper, [JSON.stringify(config)], { stdio: "pipe", windowsHide: true });
		owner.once("destroyed", this.stop);
		this.child.stdout.setEncoding("utf8");
		this.child.stdout.on("data", (chunk: string) => {
			if (this.stopped) return;
			this.buffer += chunk;
			if (this.buffer.length > 4_000_000) {
				this.stop();
				this.unavailable();
				return;
			}
			let newline = this.buffer.indexOf("\n");
			while (newline >= 0) {
				const line = this.buffer.slice(0, newline);
				this.buffer = this.buffer.slice(newline + 1);
				try {
					const payload = JSON.parse(line);
					if (
						payload.event === "preview-frame" &&
						typeof payload.imageDataUrl === "string" &&
						payload.imageDataUrl.startsWith("data:image/png;base64,")
					) {
						if (!owner.isDestroyed())
							owner.send("recording-preview-frame", {
								captureId: id,
								imageDataUrl: payload.imageDataUrl,
								sourceWidth: payload.sourceWidth,
								sourceHeight: payload.sourceHeight,
							});
					}
				} catch {
					/* Ignore non-JSON helper diagnostics. */
				}
				newline = this.buffer.indexOf("\n");
			}
		});
		this.child.stdin.on("error", () => undefined);
		this.child.stderr.resume();
		this.child.once("error", () => {
			this.unavailable();
			this.stop();
		});
		this.child.once("exit", () => {
			clearTimeout(this.killTimer);
			owner.removeListener("destroyed", this.stop);
			if (!this.stopped) this.unavailable();
		});
	}
	private unavailable() {
		if (!this.owner.isDestroyed())
			this.owner.send("recording-preview-frame", { captureId: this.id, unavailable: true });
	}
	stop = () => {
		if (this.stopped) return;
		this.stopped = true;
		this.owner.removeListener("destroyed", this.stop);
		this.child.stdin.end("stop\n");
		if (this.child.exitCode === null) {
			this.killTimer = setTimeout(() => this.child.kill(), 2_000);
			this.killTimer.unref();
		}
	};
}
