import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { app } from "electron";

export function blurryExecutableCandidates() {
	if (process.env.OPENSCREEN_BLURRY_EXE) return [process.env.OPENSCREEN_BLURRY_EXE];
	return [
		path.join(process.resourcesPath, "blurry", "Blurry.exe"),
		path.resolve(
			process.env.APP_ROOT || app.getAppPath(),
			"..",
			"Blurry",
			"Blurry",
			"bin",
			"Release",
			"net8.0-windows",
			"Blurry.exe",
		),
	];
}

async function sendBlurryCommand(command: "settings" | "escape" | "state"): Promise<string | null> {
	const instance = process.env.OPENSCREEN_BLURRY_INSTANCE;
	if (instance && !/^[A-Za-z0-9_-]{1,64}$/.test(instance))
		throw new Error("Invalid isolated Blurry instance name");
	const suffix = instance ? `.${instance}` : "";
	return new Promise((resolve, reject) => {
		const socket = net.createConnection(
			`\\\\.\\pipe\\Blurry.Settings.${os.userInfo().username}${suffix}`,
		);
		let settled = false;
		let connected = false;
		let reply = "";
		const finish = (response: string | null, error?: Error) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			if (error) reject(error);
			else resolve(response);
		};
		socket.setTimeout(1500, () => finish(null, new Error(`Blurry did not acknowledge ${command}`)));
		socket.on("error", (error: NodeJS.ErrnoException) =>
			finish(null, ["ENOENT", "ECONNREFUSED"].includes(error.code ?? "") ? undefined : error),
		);
		socket.on("connect", () => {
			connected = true;
			socket.write(`${command}\n`);
		});
		socket.on("data", (data) => {
			reply += data.toString();
			if (reply.length > 200) finish(null, new Error("Invalid Blurry response"));
			else if (reply.includes("\n")) finish(reply.split("\n")[0].trim());
		});
		socket.on("close", () =>
			finish(
				null,
				connected ? new Error(`Blurry closed before acknowledging ${command}`) : undefined,
			),
		);
	});
}

export async function getBlurrySelected(): Promise<boolean> {
	const response = await sendBlurryCommand("state");
	if (response === "selected") return true;
	if (response === "idle" || response === null) return false;
	throw new Error("Blurry does not support toggle state; use the updated companion.");
}

export async function setBlurrySelected(selected: boolean): Promise<boolean> {
	if (process.platform !== "win32") throw new Error("Original Blurry is Windows-only");
	if (!selected) {
		const response = await sendBlurryCommand("escape");
		if (response === "cleared" || response === null) return false;
		throw new Error("Blurry did not acknowledge Escape; selection was not cleared.");
	}
	await openBlurrySettings();
	for (let attempt = 0; attempt < 80; attempt++) {
		if (await getBlurrySelected()) return true;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error("Blurry settings did not become ready.");
}

let opening: Promise<void> | undefined;
export function openBlurrySettings(): Promise<void> {
	if (opening) return opening;
	opening = (async () => {
		if (process.platform !== "win32") throw new Error("Original Blurry is Windows-only");
		const response = await sendBlurryCommand("settings");
		if (response === "opened") return;
		if (response !== null) throw new Error("Blurry did not open its original settings.");
		const executable = blurryExecutableCandidates().find((candidate) => fs.existsSync(candidate));
		if (!executable)
			throw new Error(
				"Original Blurry was not found. Set OPENSCREEN_BLURRY_EXE to its executable.",
			);
		await new Promise<void>((resolve, reject) => {
			const child = spawn(executable, [], {
				cwd: path.dirname(executable),
				detached: true,
				stdio: "ignore",
				windowsHide: true,
			});
			child.once("error", reject);
			child.once("spawn", () => {
				child.unref();
				resolve();
			});
		});
	})().finally(() => {
		opening = undefined;
	});
	return opening;
}
