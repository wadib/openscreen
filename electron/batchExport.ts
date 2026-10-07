import { type ChildProcess, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, type WebContents } from "electron";
import { type BatchExportEvent, parseEventLine } from "./batchExportEvents";
import { type CliExportQuality, parseCliExportArgs, resolveCliExportJobs } from "./cliExport";

/**
 * In-app Batch export: runs the command-line exporter (`--export-dir`) as a separate,
 * hidden Openscreen process so the editor stays usable, and relays its progress events
 * to the window that started it.
 */

export interface BatchExportOptions {
	folder: string;
	outputDir: string;
	only: string;
	exclude: string;
	quality: CliExportQuality;
	overwrite: boolean;
}

export type BatchExportUiEvent = BatchExportEvent | { type: "exit"; code: number | null };

/** Command-line arguments for the export process. Pure, so it can be tested. */
export function buildBatchExportArgs(
	options: BatchExportOptions,
	runtime: { defaultApp: boolean; appPath: string; platform: NodeJS.Platform; userDataDir: string },
): string[] {
	const args: string[] = [];
	// In development the Electron binary needs the app folder as its first argument.
	if (runtime.defaultApp) args.push(runtime.appPath);
	args.push("--export-dir", options.folder, options.outputDir);
	for (const pattern of splitPatterns(options.only)) args.push("--only", pattern);
	for (const pattern of splitPatterns(options.exclude)) args.push("--exclude", pattern);
	args.push("--quality", options.quality);
	if (options.overwrite) args.push("--overwrite");
	args.push("--progress-json");
	// A separate profile keeps the background export from contending with the open editor.
	args.push(`--user-data-dir=${runtime.userDataDir}`);
	if (runtime.platform === "linux" && process.env.WAYLAND_DISPLAY) {
		args.push("--ozone-platform=wayland");
	}
	return args;
}

/** Comma- or space-separated patterns; empty input means none. */
export function splitPatterns(value: string): string[] {
	return value
		.split(/[,\s]+/)
		.map((pattern) => pattern.trim())
		.filter(Boolean);
}

function requestFor(options: BatchExportOptions) {
	const args = ["--export-dir", options.folder, options.outputDir, "--quality", options.quality];
	for (const pattern of splitPatterns(options.only)) args.push("--only", pattern);
	for (const pattern of splitPatterns(options.exclude)) args.push("--exclude", pattern);
	if (options.overwrite) args.push("--overwrite");
	const request = parseCliExportArgs(args);
	if (!request) throw new Error("Invalid batch export options");
	return request;
}

let running: { child: ChildProcess; sender: WebContents } | null = null;

function send(sender: WebContents, event: BatchExportUiEvent) {
	if (!sender.isDestroyed()) sender.send("batch-export-event", event);
}

export function registerBatchExportHandlers() {
	ipcMain.handle("batch-export-pick-folder", async (event, title: string, defaultPath?: string) => {
		const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
		const options: Electron.OpenDialogOptions = {
			title,
			defaultPath,
			properties: ["openDirectory", "createDirectory"],
		};
		const result = window
			? await dialog.showOpenDialog(window, options)
			: await dialog.showOpenDialog(options);
		return result.canceled ? null : (result.filePaths[0] ?? null);
	});

	ipcMain.handle("batch-export-preview", async (_event, options: BatchExportOptions) => {
		try {
			const resolved = await resolveCliExportJobs(requestFor(options));
			return {
				jobs: resolved.jobs.map((job) => ({ project: job.project, output: job.output })),
				skipped: resolved.skipped.map((job) => ({ project: job.project, output: job.output })),
			};
		} catch (error) {
			return {
				error: error instanceof Error ? error.message : String(error),
				jobs: [],
				skipped: [],
			};
		}
	});

	ipcMain.handle("batch-export-start", async (event, options: BatchExportOptions) => {
		if (running) return { started: false, error: "A batch export is already running" };
		requestFor(options); // validate before spawning
		const args = buildBatchExportArgs(options, {
			defaultApp: Boolean(process.defaultApp),
			appPath: app.getAppPath(),
			platform: process.platform,
			userDataDir: path.join(os.tmpdir(), "openscreen-batch-export"),
		});
		const child = spawn(process.execPath, args, {
			stdio: ["ignore", "pipe", "pipe"],
			env: process.env,
			windowsHide: true,
		});
		const sender = event.sender;
		running = { child, sender };
		let buffer = "";
		child.stdout?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				const parsed = parseEventLine(line);
				if (parsed) send(sender, parsed);
			}
		});
		child.on("error", (error) => {
			send(sender, { type: "error", message: error.message });
		});
		child.on("exit", (code) => {
			const parsed = parseEventLine(buffer);
			if (parsed) send(sender, parsed);
			send(sender, { type: "exit", code });
			running = null;
		});
		return { started: true };
	});

	ipcMain.handle("batch-export-cancel", () => {
		if (!running) return false;
		running.child.kill();
		return true;
	});
}
