// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { validateFinalizedMp4 } from "./validate-mp4";

let folder: string;
beforeEach(async () => {
	folder = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-mp4-test-"));
});
afterEach(async () => {
	await fs.rm(folder, { recursive: true, force: true });
});
function box(type: string, extended = false) {
	const bytes = Buffer.alloc(extended ? 16 : 8);
	bytes.writeUInt32BE(extended ? 1 : bytes.length);
	bytes.write(type, 4, "ascii");
	if (extended) bytes.writeBigUInt64BE(BigInt(bytes.length), 8);
	return bytes;
}
async function fixture(bytes: Buffer) {
	const file = path.join(folder, "recording.mp4");
	await fs.writeFile(file, bytes);
	return file;
}
it("accepts complete top-level boxes, including extended media headers", async () => {
	await expect(
		validateFinalizedMp4(
			await fixture(Buffer.concat([box("ftyp"), box("mdat", true), box("moov")])),
		),
	).resolves.toBeUndefined();
});
it("rejects an unfinalized file without changing its bytes", async () => {
	const bytes = Buffer.concat([box("ftyp"), box("mdat")]);
	const file = await fixture(bytes);
	await expect(validateFinalizedMp4(file)).rejects.toThrow("playback index is missing");
	await expect(fs.readFile(file)).resolves.toEqual(bytes);
});
it.each([
	Buffer.alloc(4),
	Buffer.concat([box("ftyp"), box("mdat", true).subarray(0, 12)]),
	Buffer.from([0, 0, 0, 7, 109, 100, 97, 116]),
])("rejects truncated and invalid headers", async (bytes) => {
	await expect(validateFinalizedMp4(await fixture(bytes))).rejects.toThrow();
});
it("rejects an extended size beyond safe integer precision", async () => {
	const bytes = box("mdat", true);
	bytes.writeBigUInt64BE(2n ** 63n, 8);
	await expect(validateFinalizedMp4(await fixture(bytes))).rejects.toThrow("invalid or incomplete");
});
