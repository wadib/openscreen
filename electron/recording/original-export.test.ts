import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyOriginalRecording } from "./original-export";

const recording = Buffer.concat([
	Buffer.from([0, 0, 0, 24]),
	Buffer.from("ftypisom-original-video-and-audio"),
]);
let directory: string;
let source: string;
let target: string;

beforeEach(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-original-export-"));
	source = path.join(directory, "recording.mp4");
	target = path.join(directory, "export.mp4");
	await fs.writeFile(source, recording);
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(directory, { recursive: true, force: true });
});

describe("original MP4 export", () => {
	it("copies every byte without modifying the source, including into a new folder", async () => {
		target = path.join(directory, "new folder", "export.mp4");
		expect(await copyOriginalRecording(source, target)).toBe(target);
		expect(await fs.readFile(target)).toEqual(recording);
		expect(await fs.readFile(source)).toEqual(recording);
		expect(await fs.readdir(path.dirname(target))).toEqual(["export.mp4"]);
	});
	it("replaces an existing destination only after the copy completes", async () => {
		await fs.writeFile(target, "previous export");
		await copyOriginalRecording(source, target);
		expect(await fs.readFile(target)).toEqual(recording);
		expect(await fs.readdir(directory)).toEqual(["export.mp4", "recording.mp4"]);
	});
	it("refuses to overwrite the source", async () => {
		await expect(copyOriginalRecording(source, source)).rejects.toThrow("different destination");
		expect(await fs.readFile(source)).toEqual(recording);
	});
	it.skipIf(process.platform !== "win32")(
		"recognizes the source despite Windows path case differences",
		async () => {
			await expect(copyOriginalRecording(source, source.toUpperCase())).rejects.toThrow(
				"different destination",
			);
			expect(await fs.readFile(source)).toEqual(recording);
		},
	);
	it.each(["export.webm", "relative.mp4"])("rejects invalid destination %s", async (name) => {
		const destination = name === "relative.mp4" ? name : path.join(directory, name);
		await expect(copyOriginalRecording(source, destination)).rejects.toThrow("absolute MP4");
		expect(await fs.readFile(source)).toEqual(recording);
	});
	it.each([
		Buffer.alloc(0),
		Buffer.from("not an MP4 recording"),
	])("rejects invalid MP4 bytes without touching the destination", async (bytes) => {
		await fs.writeFile(source, bytes);
		await fs.writeFile(target, "previous export");
		await expect(copyOriginalRecording(source, target)).rejects.toThrow("readable MP4");
		expect(await fs.readFile(target, "utf8")).toBe("previous export");
	});
	it("retains the previous destination when the recording is missing", async () => {
		await fs.writeFile(target, "previous export");
		await expect(
			copyOriginalRecording(path.join(directory, "missing.mp4"), target),
		).rejects.toThrow();
		expect(await fs.readFile(target, "utf8")).toBe("previous export");
	});
	it("cleans up partial copies and preserves both files on a copy failure", async () => {
		await fs.writeFile(target, "previous export");
		vi.spyOn(fs, "copyFile").mockImplementationOnce(async (_source, partial) => {
			await fs.writeFile(partial, "partial copy");
			throw new Error("Disk full");
		});
		await expect(copyOriginalRecording(source, target)).rejects.toThrow("Disk full");
		expect(await fs.readFile(source)).toEqual(recording);
		expect(await fs.readFile(target, "utf8")).toBe("previous export");
		expect(await fs.readdir(directory)).toEqual(["export.mp4", "recording.mp4"]);
	});
	it("preserves the previous destination and removes the temporary copy if replacement fails", async () => {
		await fs.writeFile(target, "previous export");
		vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("Destination locked"));
		await expect(copyOriginalRecording(source, target)).rejects.toThrow("Destination locked");
		expect(await fs.readFile(target, "utf8")).toBe("previous export");
		expect(await fs.readdir(directory)).toEqual(["export.mp4", "recording.mp4"]);
	});
});
