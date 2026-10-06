import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-mcp-e2e-"));
const source = path.join(temp, "source.mp4");
const mic = path.join(temp, "microphone.wav");
const projectPath = path.join(temp, "original.openscreen");
const copy = path.join(temp, "edited.openscreen");
const output = path.join(temp, "export.mp4");
execFileSync(
	"ffmpeg",
	[
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		"color=c=0x20a060:s=640x360:r=30",
		"-t",
		"4",
		"-c:v",
		"libx264",
		source,
	],
	{ windowsHide: true, timeout: 30_000 },
);
execFileSync(
	"ffmpeg",
	[
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=880:sample_rate=48000",
		"-t",
		"4",
		"-c:a",
		"pcm_s16le",
		mic,
	],
	{ windowsHide: true, timeout: 30_000 },
);
await fs.writeFile(
	projectPath,
	JSON.stringify({
		version: 2,
		media: { screenVideoPath: source, microphoneAudioPath: mic },
		editor: {
			wallpaper: "#102030",
			padding: 0,
			shadowIntensity: 0,
			borderRadius: 0,
			autoZoomEnabled: false,
			zoomRegions: [],
			trimRegions: [],
			speedRegions: [],
			aspectRatio: "16:9",
		},
	}),
);
const hash = async (file) =>
	createHash("sha256")
		.update(await fs.readFile(file))
		.digest("hex");
const originals = {
	project: await hash(projectPath),
	source: await hash(source),
	mic: await hash(mic),
};
const child = spawn(
	process.execPath,
	[
		path.join(repo, "scripts", "studio-mcp.mjs"),
		"--executable",
		path.join(
			repo,
			"node_modules",
			"electron",
			"dist",
			process.platform === "win32" ? "electron.exe" : "electron",
		),
		"--app",
		repo,
		"--root",
		temp,
	],
	{ windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
);
let studioPid;
let buffer = "";
let diagnostics = "";
let sequence = 0;
const pending = new Map();
child.stderr.on("data", (chunk) => {
	diagnostics += chunk.toString();
	const pid = diagnostics.match(/Studio MCP starting \(PID (\d+)\)/);
	if (pid) studioPid = Number(pid[1]);
});
child.stdout.on("data", (chunk) => {
	buffer += chunk.toString();
	while (buffer.includes("\n")) {
		const newline = buffer.indexOf("\n");
		const line = buffer.slice(0, newline);
		buffer = buffer.slice(newline + 1);
		const response = JSON.parse(line);
		const entry = pending.get(response.id);
		if (entry) {
			clearTimeout(entry.timer);
			pending.delete(response.id);
			entry.resolve(response);
		}
	}
});
const rpc = (method, params = {}) =>
	new Promise((resolve, reject) => {
		const id = ++sequence;
		const timer = setTimeout(() => {
			pending.delete(id);
			reject(new Error(`MCP timeout for ${method}: ${diagnostics}`));
		}, 90_000);
		pending.set(id, { resolve, reject, timer });
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
	});
const call = async (name, args = {}, allowError = false) => {
	const response = await rpc("tools/call", { name, arguments: args });
	assert(!response.error, JSON.stringify(response.error));
	if (response.result.isError) {
		if (allowError) return response.result;
		throw new Error(`${name}: ${response.result.content[0].text}`);
	}
	return name === "studio_snapshot"
		? response.result.content[0]
		: JSON.parse(response.result.content[0].text);
};
const waitFor = async (callback, timeout = 30_000) => {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const value = await callback();
		if (value) return value;
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error("Condition timed out");
};
try {
	assert.equal(
		(
			await rpc("initialize", {
				protocolVersion: "2025-03-26",
				capabilities: {},
				clientInfo: { name: "local-test", version: "1" },
			})
		).result.serverInfo.name,
		"openscreen-studio",
	);
	child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
	const tools = (await rpc("tools/list")).result.tools;
	assert.equal(tools.length, 14);
	const initial = await call("studio_status");
	studioPid = initial.studioProcessId;
	assert(Number.isInteger(studioPid) && studioPid !== process.pid && studioPid !== child.pid);
	assert.equal(initial.ready, false);
	assert((await call("start_recording", {}, true)).isError);
	assert(
		(await call("studio_open_project", { path: path.join(repo, "package.json") }, true)).isError,
	);
	await call("studio_open_project", { path: projectPath });
	let state = await waitFor(async () => {
		const state = await call("studio_status");
		return state.ready && state;
	});
	const zoom = await call("studio_set_zoom", {
		revision: state.revision,
		startMs: 200,
		endMs: 1400,
		focus: { cx: 0.5, cy: 0.5 },
		area: { width: 0.6, height: 0.2, fit: "fit" },
	});
	assert(
		(await call("studio_set_layout", { revision: state.revision, padding: 10 }, true)).isError,
	);
	state = await call("studio_status");
	assert(state.project.editor.zoomRegions.some((region) => region.id === zoom.id));
	await call("studio_set_microphone", {
		revision: state.revision,
		gain: 0.8,
		offsetMs: 25,
		muted: false,
	});
	state = await call("studio_status");
	assert.equal(state.project.media.microphoneGain, 0.8);
	await call("studio_set_layout", { revision: state.revision, padding: 12 });
	state = await call("studio_status");
	await call("studio_history", { revision: state.revision, action: "undo" });
	state = await call("studio_status");
	assert.equal(state.project.editor.padding, 0);
	await call("studio_history", { revision: state.revision, action: "redo" });
	state = await call("studio_status");
	assert.equal(state.project.editor.padding, 12);
	await call("studio_set_layout", { revision: state.revision, padding: 0 });
	state = await call("studio_status");
	const trim = await call("studio_add_trim", {
		revision: state.revision,
		startMs: 3500,
		endMs: 4000,
	});
	state = await call("studio_status");
	await call("studio_add_speed", {
		revision: state.revision,
		startMs: 1500,
		endMs: 2500,
		speed: 1.5,
	});
	state = await call("studio_status");
	await call("studio_remove_region", { revision: state.revision, kind: "trim", id: trim.id });
	await call("studio_preview", { action: "seek", timeMs: 700 });
	await new Promise((resolve) => setTimeout(resolve, 300));
	const screenshot = await call("studio_snapshot");
	const png = Buffer.from(screenshot.data, "base64");
	assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
	await fs.writeFile(path.join(temp, "studio.png"), png);
	await call("studio_preview", { action: "play" });
	await new Promise((resolve) => setTimeout(resolve, 300));
	await call("studio_preview", { action: "pause" });
	assert((await call("studio_open_project", { path: projectPath }, true)).isError);
	state = await call("studio_status");
	await call("studio_save_copy", { path: copy, revision: state.revision });
	state = await call("studio_status");
	assert.equal(state.hasUnsavedChanges, false);
	assert.equal(state.projectPath, copy);
	assert(
		(await call("studio_save_copy", { path: projectPath, revision: state.revision }, true)).isError,
	);
	assert.equal(JSON.parse(await fs.readFile(copy, "utf8")).media.microphoneOffsetMs, 25);
	const job = await call("studio_export", {
		path: output,
		revision: state.revision,
		quality: "source",
	});
	assert.equal(job.state, "running");
	assert(
		(await call("studio_set_layout", { revision: state.revision, padding: 10 }, true)).isError,
	);
	state = await waitFor(async () => {
		const state = await call("studio_status");
		return state.exportJob?.state !== "running" && state;
	}, 180_000);
	assert.equal(state.exportJob.state, "completed", state.exportJob.error);
	const probe = JSON.parse(
		execFileSync(
			"ffprobe",
			["-v", "error", "-show_streams", "-show_format", "-of", "json", output],
			{ windowsHide: true },
		).toString(),
	);
	assert(probe.streams.some((stream) => stream.codec_type === "video"));
	assert(probe.streams.some((stream) => stream.codec_type === "audio"));
	const audio = execFileSync(
		"ffmpeg",
		["-v", "error", "-i", output, "-vn", "-f", "s16le", "-ac", "1", "-ar", "48000", "pipe:1"],
		{ windowsHide: true, timeout: 30_000 },
	);
	let energy = 0;
	for (let index = 0; index + 1 < audio.length; index += 2) energy += audio.readInt16LE(index) ** 2;
	const audioRms = Math.sqrt(energy / (audio.length / 2));
	assert(audioRms > 200, `Microphone-only export must contain audible samples, RMS ${audioRms}`);
	assert(Number(probe.format.duration) > 3 && Number(probe.format.duration) < 4.1);
	assert((await call("studio_export", { path: output, revision: state.revision }, true)).isError);
	assert((await call("studio_cancel_export", {}, true)).isError);
	const canceledOutput = path.join(temp, "canceled.mp4");
	await call("studio_export", {
		path: canceledOutput,
		revision: state.revision,
		quality: "source",
	});
	await call("studio_cancel_export");
	state = await waitFor(async () => {
		const state = await call("studio_status");
		return state.exportJob?.state !== "running" && state;
	});
	assert.equal(state.exportJob.state, "failed");
	assert.equal(
		await fs.stat(canceledOutput).then(
			() => true,
			() => false,
		),
		false,
	);
	await call("studio_open_project", { path: copy });
	state = await waitFor(async () => {
		const state = await call("studio_status");
		return state.ready && state;
	});
	assert.equal(state.project.editor.zoomRegions[0].area.width, 0.6);
	assert.equal(await hash(projectPath), originals.project);
	assert.equal(await hash(source), originals.source);
	assert.equal(await hash(mic), originals.mic);
	child.stdin.end();
	await new Promise((resolve) => setTimeout(resolve, 300));
	assert.doesNotThrow(() => process.kill(studioPid, 0), "Disconnect must leave Studio running");
	const report = {
		passed: true,
		tools: tools.map((tool) => tool.name),
		originals,
		projectCopy: copy,
		projectCopySha256: await hash(copy),
		export: output,
		exportSha256: await hash(output),
		exportDuration: probe.format.duration,
		microphoneOnlyAudioRms: audioRms,
		canceledExportLeftNoFile: true,
		screenshot: path.join(temp, "studio.png"),
	};
	await fs.writeFile(path.join(temp, "verification.json"), JSON.stringify(report, null, 2));
	console.log(
		JSON.stringify(
			{
				passed: true,
				verification: path.join(temp, "verification.json"),
				export: output,
				sha256: report.exportSha256,
			},
			null,
			2,
		),
	);
} finally {
	for (const entry of pending.values()) clearTimeout(entry.timer);
	// Only the isolated Studio launched by this test; never the user's app.
	if (studioPid) {
		try {
			process.kill(studioPid, "SIGTERM");
		} catch (error) {
			if (error.code !== "ESRCH") {
				process.stderr.write("Could not close the isolated Studio test process\n");
				process.exitCode = 1;
			}
		}
	}
	child.stdin.end();
	if (child.exitCode === null) {
		child.kill("SIGTERM");
		await new Promise((resolve) => {
			child.once("exit", resolve);
			setTimeout(resolve, 5000).unref();
		});
	}
}
