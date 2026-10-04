import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import path from "node:path";
import { createServer } from "vite";

process.env.OPENSCREEN_E2E_DEV = "true";
if (process.platform === "win32" && !process.env.OPENSCREEN_WGC_CAPTURE_EXE) {
	const arch = process.arch === "arm64" ? "win32-arm64" : "win32-x64";
	const helper = path.resolve("electron/native/bin", arch, "wgc-capture.exe");
	if (existsSync(helper)) process.env.OPENSCREEN_WGC_CAPTURE_EXE = helper;
}
const ready = once(process, "openscreen-electron-ready");
const server = await createServer({ server: { host: "127.0.0.1", port: 5174 } });
let timeout;
try {
	await server.listen();
	await Promise.race([
		ready,
		new Promise((_, reject) => {
			timeout = setTimeout(
				() => reject(new Error("Electron development files did not become ready")),
				120_000,
			);
		}),
	]);
	clearTimeout(timeout);
	const url = server.resolvedUrls.local[0];
	console.log(`Testing Electron against live source: ${url}`);
	const child = spawn(
		process.execPath,
		[path.resolve("node_modules/@playwright/test/cli.js"), "test", ...process.argv.slice(2)],
		{
			stdio: "inherit",
			env: { ...process.env, VITE_DEV_SERVER_URL: url },
		},
	);
	const [code, signal] = await once(child, "exit");
	process.exitCode = code ?? (signal ? 1 : 0);
} finally {
	clearTimeout(timeout);
	await server.close();
}

// vite-plugin-electron owns a preload watcher outside the server's watcher list.
process.exit(process.exitCode ?? 0);
