import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function comparablePath(filePath: string) {
	return process.platform === "win32" ? filePath.toLowerCase() : filePath;
}

export async function copyOriginalRecording(source: string, destination: string): Promise<string> {
	for (const filePath of [source, destination]) {
		if (
			typeof filePath !== "string" ||
			filePath.includes("\0") ||
			!path.isAbsolute(filePath) ||
			path.extname(filePath).toLowerCase() !== ".mp4"
		) {
			throw new Error("Original export requires absolute MP4 file paths");
		}
	}
	const target = path.normalize(destination);
	const realSource = await fs.realpath(source);
	const realTarget = await fs.realpath(target).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return path.resolve(target);
		throw error;
	});
	if (comparablePath(realSource) === comparablePath(realTarget)) {
		throw new Error("Choose a different destination to preserve the original recording");
	}

	const file = await fs.open(source, "r");
	try {
		const info = await file.stat();
		const header = Buffer.alloc(8);
		const { bytesRead } = await file.read(header, 0, header.length, 0);
		if (
			!info.isFile() ||
			info.size <= 8 ||
			bytesRead !== 8 ||
			header.toString("ascii", 4) !== "ftyp"
		) {
			throw new Error("The original recording is not a readable MP4");
		}
	} finally {
		await file.close();
	}

	await fs.mkdir(path.dirname(target), { recursive: true });
	const temporary = path.join(path.dirname(target), `.openscreen-${randomUUID()}.tmp`);
	try {
		await fs.copyFile(source, temporary);
		await fs.rename(temporary, target);
	} finally {
		await fs.rm(temporary, { force: true }).catch(() => undefined);
	}
	return target;
}
