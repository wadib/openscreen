import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { StringDecoder } from "node:string_decoder";

// Stdio is exclusively MCP JSON-RPC. Electron diagnostics never enter stdout.
const options = { roots: [], executable: "", app: "", profile: "" };
for (let index = 2; index < process.argv.length; index += 2) {
	const key = process.argv[index];
	const value = process.argv[index + 1];
	if (!value) throw new Error(`Missing value for ${key}`);
	if (key === "--root") options.roots.push(path.resolve(value));
	else if (key === "--executable") options.executable = path.resolve(value);
	else if (key === "--app") options.app = path.resolve(value);
	else if (key === "--profile") options.profile = path.resolve(value);
	else throw new Error(`Unknown option ${key}`);
}
if (!options.executable || !options.roots.length || options.roots.length > 20)
	throw new Error(
		"Usage: node studio-mcp.mjs --executable <Openscreen or Electron executable> [--app <repo>] --root <allowed folder> [--root <another folder>]",
	);
for (const root of options.roots)
	if (!(await fs.stat(root)).isDirectory()) throw new Error("Granted roots must already exist");
const session = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-studio-mcp-"));
await fs.chmod(session, 0o700);
const socketPath =
	process.platform === "win32"
		? `\\\\.\\pipe\\openscreen-studio-${randomUUID()}`
		: path.join(session, "studio.sock");
const token = randomBytes(32).toString("hex");
const env = {
	...process.env,
	OPENSCREEN_STUDIO_MCP_TOKEN: token,
	OPENSCREEN_STUDIO_MCP_SOCKET: socketPath,
	OPENSCREEN_STUDIO_MCP_ROOTS: JSON.stringify(options.roots),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const child = spawn(
	options.executable,
	[
		...(options.app ? [options.app] : []),
		"--studio-mcp",
		`--user-data-dir=${options.profile || path.join(session, "profile")}`,
	],
	{ env, detached: true, windowsHide: true, stdio: ["ignore", "ignore", "ignore"] },
);
if (child.pid) process.stderr.write(`Studio MCP starting (PID ${child.pid})\n`);
let exited = false;
child.on("exit", () => {
	exited = true;
});
child.on("error", () => {
	exited = true;
});
let socket;
const deadline = Date.now() + 60_000;
while (!socket && Date.now() < deadline && !exited) {
	try {
		socket = await new Promise((resolve, reject) => {
			const connection = net.createConnection(socketPath);
			connection.once("connect", () => {
				connection.removeListener("error", reject);
				resolve(connection);
			});
			connection.once("error", reject);
		});
	} catch {
		await new Promise((resolve) => setTimeout(resolve, 150));
	}
}
if (!socket)
	throw new Error(
		"Studio MCP did not start. Build the MCP-enabled app and check the executable path.",
	);
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
	if (Buffer.byteLength(line) > 1024 * 1024) {
		process.stdout.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request exceeds 1 MiB" } })}\n`,
		);
		return;
	}
	try {
		socket.write(`${JSON.stringify({ token, request: JSON.parse(line) })}\n`);
	} catch {
		process.stdout.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`,
		);
	}
});
const decoder = new StringDecoder("utf8");
let output = "";
socket.on("data", (chunk) => {
	output += decoder.write(chunk);
	if (Buffer.byteLength(output) > 32 * 1024 * 1024) {
		socket.destroy();
		return;
	}
	while (output.includes("\n")) {
		const newline = output.indexOf("\n");
		process.stdout.write(`${output.slice(0, newline)}\n`);
		output = output.slice(newline + 1);
	}
});
socket.on("error", () => {
	process.stderr.write("Studio MCP connection closed\n");
	input.close();
	process.exitCode = 1;
});
socket.on("close", () => {
	input.close();
	child.unref();
});
input.on("close", () => {
	socket.end();
	child.unref();
});
// Disconnecting the agent never kills Studio or loses unsaved work.
for (const signal of ["SIGINT", "SIGTERM"])
	process.on(signal, () => {
		input.close();
	});
