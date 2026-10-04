import fs from "node:fs/promises";

export async function validateFinalizedMp4(filePath: string): Promise<void> {
	const file = await fs.open(filePath, "r");
	try {
		const total = (await file.stat()).size;
		const types = new Set<string>();
		let offset = 0;
		while (offset < total) {
			const header = Buffer.alloc(16);
			const { bytesRead } = await file.read(header, 0, Math.min(16, total - offset), offset);
			if (bytesRead < 8) throw new Error("Recording MP4 has a truncated box header.");
			let length = header.readUInt32BE(0);
			const headerSize = length === 1 ? 16 : 8;
			if (length === 1) {
				if (bytesRead < 16) throw new Error("Recording MP4 has a truncated extended box header.");
				length = Number(header.readBigUInt64BE(8));
			}
			if (length === 0) length = total - offset;
			if (!Number.isSafeInteger(length) || length < headerSize || offset + length > total) {
				throw new Error("Recording MP4 has an invalid or incomplete box.");
			}
			types.add(header.toString("ascii", 4, 8));
			offset += length;
		}
		if (!["ftyp", "mdat", "moov"].every((type) => types.has(type))) {
			throw new Error(
				"Recording MP4 was not finalized: its media or playback index is missing. The original file has been preserved.",
			);
		}
	} finally {
		await file.close();
	}
}
