import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { app, dialog } from "electron";

export type AfterRecording = { mode: "editor" | "external" | "export"; editorPath?: string };
const preferencePath = () => path.join(app.getPath("userData"), "after-recording.json");

export async function readAfterRecording(): Promise<AfterRecording> {
	try {
		const value = JSON.parse(await fs.readFile(preferencePath(), "utf8"));
		if (value.mode === "export" || value.mode === "editor") return { mode: value.mode };
		if (
			value.mode === "external" &&
			typeof value.editorPath === "string" &&
			path.isAbsolute(value.editorPath)
		)
			return { mode: "external", editorPath: value.editorPath };
	} catch {
		/* Missing or invalid preferences use the original behavior. */
	}
	return { mode: "editor" };
}

export async function configureAfterRecording(): Promise<AfterRecording> {
	const previous = await readAfterRecording();
	const choice = await dialog.showMessageBox({
		title: "After recording",
		message: "When recording stops",
		buttons: ["Open in Openscreen", "Choose another editor", "Export directly", "Cancel"],
		defaultId: previous.mode === "editor" ? 0 : previous.mode === "external" ? 1 : 2,
		cancelId: 3,
		noLink: true,
	});
	if (choice.response === 3) return previous;
	let next: AfterRecording = { mode: choice.response === 2 ? "export" : "editor" };
	if (choice.response === 1) {
		const selected = await dialog.showOpenDialog({
			title: "Choose video editor",
			properties: ["openFile"],
			...(process.platform === "win32"
				? { filters: [{ name: "Applications", extensions: ["exe"] }] }
				: {}),
		});
		if (selected.canceled || !selected.filePaths[0]) return previous;
		next = { mode: "external", editorPath: selected.filePaths[0] };
	}
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
