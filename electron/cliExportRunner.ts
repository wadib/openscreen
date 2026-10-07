import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type BrowserWindow, ipcMain } from "electron";
import { type BatchExportEvent, formatEventJson, formatEventText } from "./batchExportEvents";
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

let jsonProgress = false;

/** Print a progress event as text for people, or as a JSON line for in-app Batch export. */
function emit(event: BatchExportEvent) {
	const line = jsonProgress ? formatEventJson(event) : formatEventText(event);
	if (line) process.stdout.write(`${line}\n`);
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

function runJob(
	window: BrowserWindow,
	job: CliExportJobMessage,
	index: number,
): Promise<CliExportResultMessage> {
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
			// Text output stays at every 5%; the JSON stream gets every whole percent.
			const step = jsonProgress ? 1 : 5;
			if (message.percentage - lastReported >= step || message.percentage >= 100) {
				lastReported = Math.floor(message.percentage / step) * step;
				emit({ type: "progress", index, percentage: message.percentage });
			}
		};
		const onLog = (event: Electron.IpcMainEvent, message: { id: string; message: string }) => {
			if (event.sender !== window.webContents || message.id !== job.id) return;
			emit({ type: "diagnostic", index, message: message.message });
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
	jsonProgress = request.progressJson;
	let resolved: Awaited<ReturnType<typeof resolveCliExportJobs>>;
	try {
		resolved = await resolveCliExportJobs(request);
	} catch (error) {
		emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
		return 2;
	}
	emit({
		type: "start",
		total: resolved.jobs.length,
		skipped: resolved.skipped.map((job) => job.output),
	});
	if (resolved.jobs.length === 0) return 0;

	const window = createWindow();
	try {
		await waitForReady(window);
	} catch (error) {
		emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
		return 1;
	}

	let failures = 0;
	const started = Date.now();
	const total = resolved.jobs.length;
	for (const [index, job] of resolved.jobs.entries()) {
		emit({ type: "job", index, total, project: job.project, output: job.output });
		const jobStarted = Date.now();
		const seconds = () => Math.round((Date.now() - jobStarted) / 1000);
		try {
			await fs.mkdir(path.dirname(job.output), { recursive: true });
		} catch (error) {
			failures++;
			emit({
				type: "jobDone",
				index,
				success: false,
				seconds: seconds(),
				error: `cannot create ${path.dirname(job.output)}: ${String(error)}`,
			});
			continue;
		}
		const result = await runJob(
			window,
			{ id: randomUUID(), ...job, quality: request.quality },
			index,
		);
		if (!result.success) failures++;
		emit({
			type: "jobDone",
			index,
			success: result.success,
			seconds: seconds(),
			error: result.error,
		});
		if (window.isDestroyed()) break;
	}
	emit({
		type: "summary",
		exported: total - failures,
		total,
		seconds: Math.round((Date.now() - started) / 1000),
	});
	return failures ? 1 : 0;
}

export { CliUsageError };
