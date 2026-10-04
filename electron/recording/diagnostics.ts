import { createWriteStream, type WriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export class RecordingDiagnostics {
	private failed = false;
	private ended = false;
	private constructor(
		readonly filePath: string,
		private readonly stream: WriteStream,
	) {
		stream.on("error", (error) => {
			this.failed = true;
			console.error("Recording diagnostic log could not be written:", filePath, error);
		});
	}

	static async open(filePath: string, metadata: object): Promise<RecordingDiagnostics> {
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		const stream = createWriteStream(filePath, { flags: "a" });
		const logger = new RecordingDiagnostics(filePath, stream);
		await new Promise<void>((resolve, reject) => {
			stream.once("open", () => {
				stream.off("error", reject);
				resolve();
			});
			stream.once("error", reject);
		});
		logger.write("recording-start", metadata);
		return logger;
	}

	write(event: string, data: object = {}): void {
		if (this.failed || this.ended) return;
		this.stream.write(JSON.stringify({ at: new Date().toISOString(), event, ...data }) + "\n");
	}

	async finish(): Promise<void> {
		if (this.ended || this.failed) return;
		this.ended = true;
		await new Promise<void>((resolve) => {
			this.stream.once("error", () => resolve());
			this.stream.end(resolve);
		});
	}
}
