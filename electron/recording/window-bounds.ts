import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Rectangle } from "electron";

const execFileAsync = promisify(execFile);

export async function readWindowBounds(helperPath: string, sourceId: string): Promise<Rectangle> {
	const { stdout } = await execFileAsync(
		helperPath,
		[JSON.stringify({ windowBounds: true, sourceId })],
		{
			windowsHide: true,
			timeout: 2000,
			maxBuffer: 64 * 1024,
		},
	);
	const bounds = JSON.parse(stdout);
	if (
		!bounds ||
		![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
		bounds.width <= 0 ||
		bounds.height <= 0
	)
		throw new Error("Invalid recording window bounds");
	return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}
