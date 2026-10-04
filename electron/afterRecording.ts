import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

export type AfterRecording = {
	mode: "editor" | "external" | "export";
	editorPath?: string;
	quietRecording?: boolean;
	hideAfterRecording?: boolean;
	hideAfterVideo?: boolean;
};
const preferencePath = () => path.join(app.getPath("userData"), "after-recording.json");

export async function readAfterRecording(): Promise<AfterRecording> {
	try {
		const value = JSON.parse(await fs.readFile(preferencePath(), "utf8"));
		const quiet = {
			...(value.quietRecording === true ? { quietRecording: true } : {}),
			...(value.hideAfterRecording === true ? { hideAfterRecording: true } : {}),
			...(value.hideAfterVideo === true ? { hideAfterVideo: true } : {}),
		};
		if (value.mode === "export" || value.mode === "editor") return { mode: value.mode, ...quiet };
		if (
			value.mode === "external" &&
			typeof value.editorPath === "string" &&
			path.isAbsolute(value.editorPath)
		)
			return { mode: "external", editorPath: value.editorPath, ...quiet };
	} catch {
		/* Missing or invalid preferences use the original behavior. */
	}
	return { mode: "editor" };
}

export async function writeAfterRecording(candidate: unknown): Promise<AfterRecording> {
	if (!candidate || typeof candidate !== "object") throw new Error("Invalid recording settings");
	const value = candidate as Partial<AfterRecording>;
	if (value.quietRecording !== undefined && typeof value.quietRecording !== "boolean")
		throw new Error("Invalid quiet recording setting");
	for (const key of ["hideAfterRecording", "hideAfterVideo"] as const) {
		if (value[key] !== undefined && typeof value[key] !== "boolean")
			throw new Error(`Invalid ${key} setting`);
	}
	let next: AfterRecording;
	if (value.mode === "editor" || value.mode === "export") {
		next = { mode: value.mode };
	} else if (
		value.mode === "external" &&
		typeof value.editorPath === "string" &&
		path.isAbsolute(value.editorPath)
	) {
		await fs.access(value.editorPath);
		next = { mode: "external", editorPath: value.editorPath };
	} else {
		throw new Error("Invalid recording settings");
	}
	if (value.quietRecording === true) next.quietRecording = true;
	if (value.hideAfterRecording === true) next.hideAfterRecording = true;
	if (value.hideAfterVideo === true) next.hideAfterVideo = true;
	await fs.writeFile(preferencePath(), JSON.stringify(next));
	return next;
}

export async function launchExternalEditor(editorPath: string, videoPath: string): Promise<void> {
	await fs.access(editorPath);
	await fs.access(videoPath);
	await new Promise<void>((resolve, reject) => {
		const child =
			process.platform === "darwin"
				? spawn("/usr/bin/open", ["-a", editorPath, videoPath], { detached: true, stdio: "ignore" })
				: spawn(editorPath, [videoPath], { detached: true, stdio: "ignore", shell: false });
		child.once("error", reject);
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	});
}
