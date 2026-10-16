import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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

// The handshake and the tool list are answered here, so connecting an agent does not start
// Openscreen. Studio is launched on the first tool call, and closed again when the agent
// disconnects (unless it has unsaved edits or an export running).
const contract = JSON.parse(
	readFileSync(new URL("./studio-mcp-tools.json", import.meta.url), "utf-8"),
);
const write = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

function answerLocally(rpc) {
	const result = (value) => ({ jsonrpc: "2.0", id: rpc.id, result: value });
	if (rpc.method === "initialize") {
		const requested = rpc.params?.protocolVersion;
		return result({
			protocolVersion: requested === "2025-03-26" ? requested : "2024-11-05",
			capabilities: { tools: {} },
			serverInfo: { name: "openscreen-studio", version: contract.version },
		});
	}
	if (rpc.method === "ping") return result({});
	if (rpc.method === "tools/list") return result({ tools: contract.tools });
	return undefined;
}

const token = randomBytes(32).toString("hex");
let studio; // { child, socket } once started
let starting;

async function startStudio() {
	const session = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-studio-mcp-"));
	await fs.chmod(session, 0o700);
	const socketPath =
		process.platform === "win32"
			? `\\\\.\\pipe\\openscreen-studio-${randomUUID()}`
			: path.join(session, "studio.sock");
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
			const line = output.slice(0, newline);
			output = output.slice(newline + 1);
			if (closeRequest && line.includes(`"id":"${closeRequest.id}"`)) closeRequest.done();
			else process.stdout.write(`${line}\n`);
		}
	});
	socket.on("error", () => {
		process.stderr.write("Studio MCP connection closed\n");
		studio = undefined;
	});
	socket.on("close", () => {
		studio = undefined;
		child.unref();
	});
	return { child, socket };
}

const send = (request) => studio.socket.write(`${JSON.stringify({ token, request })}\n`);

// Requests are handled in arrival order, so a call sent while Studio starts is not overtaken.
let queue = Promise.resolve();
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
	queue = queue.then(async () => {
		if (Buffer.byteLength(line) > 1024 * 1024) {
			write(rpcError(null, -32600, "Request exceeds 1 MiB"));
			return;
		}
		let rpc;
		try {
			rpc = JSON.parse(line);
		} catch {
			write(rpcError(null, -32700, "Parse error"));
			return;
		}
		if (!rpc || typeof rpc !== "object" || Array.isArray(rpc)) {
			write(rpcError(null, -32600, "Invalid request"));
			return;
		}
		if (rpc.id === undefined) return; // notifications need no Studio
		const local = answerLocally(rpc);
		if (local) {
			write(local);
			return;
		}
		try {
			if (!studio) {
				starting ??= startStudio();
				studio = await starting;
				starting = undefined;
			}
			send(rpc);
		} catch (error) {
			starting = undefined;
			write(
				rpcError(rpc.id ?? null, -32603, error instanceof Error ? error.message : String(error)),
			);
		}
	});
});

let closeRequest;
async function disconnect() {
	await queue;
	if (!studio) {
		process.exit(0);
		return;
	}
	// Ask Studio to close. It refuses while there are unsaved edits or an export is running,
	// so disconnecting the agent never loses work; a refused Studio stays open.
	const id = `close-${randomUUID()}`;
	await new Promise((resolve) => {
		const timer = setTimeout(resolve, 5_000);
		closeRequest = {
			id,
			done: () => {
				clearTimeout(timer);
				resolve();
			},
		};
		send({
			jsonrpc: "2.0",
			id,
			method: "tools/call",
			params: { name: "studio_close", arguments: {} },
		});
	});
	studio?.socket.end();
	studio?.child.unref();
	process.exit(0);
}
input.on("close", () => void disconnect());
for (const signal of ["SIGINT", "SIGTERM"])
	process.on(signal, () => {
		input.close();
	});
