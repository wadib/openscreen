import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type BrowserWindow, ipcMain } from "electron";
import {
	type CliExportQuality,
	type CliExportRequest,
	CliUsageError,
	resolveCliExportJobs,
} from "./cliExport";

export interface CliExportJobMessage {
	id: string;
	project: string;
	output: string;
	quality: CliExportQuality;
}

export interface CliExportResultMessage {
	id: string;
	success: boolean;
	error?: string;
}

const READY_TIMEOUT_MS = 120_000;
const JOB_TIMEOUT_MS = 6 * 60 * 60 * 1000;

function log(line: string) {
	process.stdout.write(`${line}\n`);
}

function waitForReady(window: BrowserWindow): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ipcMain.removeListener("cli-export-ready", onReady);
			reject(new Error("The editor did not start"));
		}, READY_TIMEOUT_MS);
		const onReady = (event: Electron.IpcMainEvent) => {
			if (event.sender !== window.webContents) return;
			clearTimeout(timer);
			ipcMain.removeListener("cli-export-ready", onReady);
			resolve();
		};
		ipcMain.on("cli-export-ready", onReady);
	});
}

function runJob(window: BrowserWindow, job: CliExportJobMessage): Promise<CliExportResultMessage> {
	return new Promise((resolve) => {
		let lastReported = -10;
		const cleanup = () => {
			clearTimeout(timer);
			ipcMain.removeListener("cli-export-progress", onProgress);
			ipcMain.removeListener("cli-export-result", onResult);
			ipcMain.removeListener("cli-export-log", onLog);
			window.removeListener("closed", onClosed);
		};
		const onProgress = (
			event: Electron.IpcMainEvent,
			message: { id: string; percentage: number },
		) => {
			if (event.sender !== window.webContents || message.id !== job.id) return;
			if (message.percentage - lastReported >= 5 || message.percentage >= 100) {
				lastReported = Math.floor(message.percentage / 5) * 5;
				log(`  ${Math.round(message.percentage)}%`);
			}
		};
		const onLog = (event: Electron.IpcMainEvent, message: { id: string; message: string }) => {
			if (event.sender !== window.webContents || message.id !== job.id) return;
			log(`  ${message.message}`);
		};
		const onResult = (event: Electron.IpcMainEvent, message: CliExportResultMessage) => {
			if (event.sender !== window.webContents || message.id !== job.id) return;
			cleanup();
			resolve(message);
		};
		const onClosed = () => {
			cleanup();
			resolve({ id: job.id, success: false, error: "The editor window closed" });
		};
		const timer = setTimeout(() => {
			cleanup();
			resolve({ id: job.id, success: false, error: "Timed out" });
		}, JOB_TIMEOUT_MS);
		ipcMain.on("cli-export-progress", onProgress);
		ipcMain.on("cli-export-result", onResult);
		ipcMain.on("cli-export-log", onLog);
		window.once("closed", onClosed);
		window.webContents.send("cli-export-job", job);
	});
}

/** Run every job in one editor window. Resolves to the process exit code. */
export async function runCliExport(
	request: CliExportRequest,
	createWindow: () => BrowserWindow,
): Promise<number> {
	let resolved: Awaited<ReturnType<typeof resolveCliExportJobs>>;
	try {
		resolved = await resolveCliExportJobs(request);
	} catch (error) {
		log(`openscreen: ${error instanceof Error ? error.message : String(error)}`);
		return 2;
	}
	for (const job of resolved.skipped) log(`skip ${job.output} (exists; use --overwrite)`);
	if (resolved.jobs.length === 0) {
		log("Nothing to export.");
		return 0;
	}

	const window = createWindow();
	try {
		await waitForReady(window);
	} catch (error) {
		log(`openscreen: ${error instanceof Error ? error.message : String(error)}`);
		return 1;
	}

	let failures = 0;
	const started = Date.now();
	for (const [index, job] of resolved.jobs.entries()) {
		log(`[${index + 1}/${resolved.jobs.length}] ${job.project} -> ${job.output}`);
		const jobStarted = Date.now();
		try {
			await fs.mkdir(path.dirname(job.output), { recursive: true });
		} catch (error) {
			failures++;
			log(`  FAILED: cannot create ${path.dirname(job.output)}: ${String(error)}`);
			continue;
		}
		const result = await runJob(window, { id: randomUUID(), ...job, quality: request.quality });
		const seconds = ((Date.now() - jobStarted) / 1000).toFixed(0);
		if (result.success) {
			log(`  done in ${seconds}s`);
		} else {
			failures++;
			log(`  FAILED after ${seconds}s: ${result.error ?? "unknown error"}`);
		}
		if (window.isDestroyed()) break;
	}
	const total = ((Date.now() - started) / 1000).toFixed(0);
	log(`${resolved.jobs.length - failures}/${resolved.jobs.length} exported in ${total}s`);
	return failures ? 1 : 0;
}

export { CliUsageError };
