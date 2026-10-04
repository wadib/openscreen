import type { ChildProcessWithoutNullStreams } from "node:child_process";

export class CaptureStopPendingError extends Error {
	constructor() {
		super(
			"Recording is still being finalized. It has not been terminated. Keep waiting or retry Stop.",
		);
		this.name = "CaptureStopPendingError";
	}
}

export function waitForCaptureStop(
	proc: ChildProcessWithoutNullStreams,
	outputPath: string,
	readOutput: () => string,
	timeoutMs = 15_000,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			clearTimeout(timer);
			proc.off("close", onClose);
			proc.off("error", onError);
		};
		const onClose = (code: number | null) => {
			cleanup();
			const output = readOutput();
			if (code !== 0) {
				reject(
					new Error(
						output.trim() || `Native Windows capture exited with code=${code ?? "unknown"}`,
					),
				);
				return;
			}
			resolve(output.match(/Recording stopped\. Output path: (.+)/)?.[1]?.trim() || outputPath);
		};
		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};
		const timer = setTimeout(() => {
			cleanup();
			reject(new CaptureStopPendingError());
		}, timeoutMs);
		proc.once("close", onClose);
		proc.once("error", onError);
		if (proc.exitCode !== null || proc.signalCode !== null) onClose(proc.exitCode);
	});
}
