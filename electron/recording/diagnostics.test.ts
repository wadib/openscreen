// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { RecordingDiagnostics } from "./diagnostics";

it("persists full output, shutdown stages and timestamps without overwriting existing logs", async () => {
	const folder = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-log-test-"));
	try {
		const file = path.join(folder, "recording.jsonl");
		const logger = await RecordingDiagnostics.open(file, { version: "test" });
		const text = "x".repeat(200_000);
		logger.write("helper-stderr", { text });
		logger.write("stop-request");
		await logger.finish();
		await logger.finish();
		logger.write("ignored-after-close");
		const reopened = await RecordingDiagnostics.open(file, {});
		await reopened.finish();
		const rows = (await fs.readFile(file, "utf8"))
			.trim()
			.split("\n")
			.map((row) => JSON.parse(row));
		expect(rows.map((row) => row.event)).toEqual([
			"recording-start",
			"helper-stderr",
			"stop-request",
			"recording-start",
		]);
		expect(rows[1].text).toBe(text);
		expect(rows.every((row) => Number.isFinite(Date.parse(row.at)))).toBe(true);
	} finally {
		await fs.rm(folder, { recursive: true, force: true });
	}
});
