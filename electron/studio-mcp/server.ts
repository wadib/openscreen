import { randomUUID, timingSafeEqual } from "node:crypto";
import net from "node:net";
import { StringDecoder } from "node:string_decoder";
import { app, type BrowserWindow, ipcMain } from "electron";
import type { StudioArguments, StudioCommand } from "../../src/lib/studioMcpContract";
import { StudioFiles } from "./files";
import { handleStudioRpc, rpcError } from "./protocol";

export const studioMcpEnabled = process.argv.includes("--studio-mcp");
const readySenders = new Set<number>();
if (studioMcpEnabled) ipcMain.on("studio-mcp-ready", (event) => readySenders.add(event.sender.id));

export async function startStudioMcp(getWindow: () => BrowserWindow | null) {
	if (!studioMcpEnabled) return;
	const token = process.env.OPENSCREEN_STUDIO_MCP_TOKEN;
	const socket = process.env.OPENSCREEN_STUDIO_MCP_SOCKET;
	if (!token || !/^[a-f0-9]{64}$/.test(token) || !socket)
		throw new Error("MCP must be launched through scripts/studio-mcp.mjs");
	const files = await StudioFiles.create(
		JSON.parse(process.env.OPENSCREEN_STUDIO_MCP_ROOTS ?? "[]"),
	);
	delete process.env.OPENSCREEN_STUDIO_MCP_TOKEN;
	const pending = new Map<
		string,
		{
			senderId: number;
			resolve: (value: unknown) => void;
			reject: (error: Error) => void;
			timer: NodeJS.Timeout;
			cleanup: () => void;
		}
	>();
	let exportJob: { id: string; state: string; path: string; error?: string } | null = null;
	let mutationBusy = false;
	let exportTarget: string | null = null;

	function editor() {
		const window = getWindow();
		if (!window || window.isDestroyed() || window.webContents.isDestroyed())
			throw new Error("Open Studio is not available");
		const url = window.webContents.getURL();
		if (url && !url.includes("windowType=editor")) throw new Error("Open Studio is not available");
		return window;
	}
	const dispatch = async (name: string, args: StudioArguments, timeout = 30_000) => {
		const deadline = Date.now() + 30_000;
		while (!readySenders.has(editor().webContents.id)) {
			if (Date.now() > deadline) throw new Error("Studio renderer did not become ready");
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		return new Promise<unknown>((resolve, reject) => {
			const window = editor();
			const contents = window.webContents;
			const senderId = contents.id;
			const id = randomUUID();
			const onDestroyed = () => {
				clearTimeout(timer);
				pending.delete(id);
				readySenders.delete(senderId);
				reject(new Error("Studio closed before the command completed"));
			};
			const cleanup = () => contents.removeListener("destroyed", onDestroyed);
			const timer = setTimeout(() => {
				pending.delete(id);
				cleanup();
				reject(new Error("Studio command timed out; inspect status before retrying"));
			}, timeout);
			contents.once("destroyed", onDestroyed);
			pending.set(id, { senderId, resolve, reject, timer, cleanup });
			contents.send("studio-mcp-command", { id, name, args } satisfies StudioCommand);
		});
	};
	ipcMain.on(
		"studio-mcp-response",
		(event, response: { id: string; result?: unknown; error?: string }) => {
			if (!response || typeof response.id !== "string") return;
			const waiting = pending.get(response.id);
			if (!waiting || waiting.senderId !== event.sender.id) return;
			clearTimeout(waiting.timer);
			waiting.cleanup();
			pending.delete(response.id);
			if (response.error) waiting.reject(new Error(response.error));
			else waiting.resolve(response.result);
		},
	);
	ipcMain.handle("studio-mcp-write-export", async (event, data: ArrayBuffer, target: string) => {
		if (
			event.sender.id !== editor().webContents.id ||
			!exportTarget ||
			target !== exportTarget ||
			!(data instanceof ArrayBuffer)
		)
			throw new Error("No agent export is authorized for this path");
		exportTarget = null;
		return { success: true, path: await files.writeNew(target, ".mp4", new Uint8Array(data)) };
	});

	async function execute(name: string, args: StudioArguments): Promise<unknown> {
		if (name === "studio_status")
			return {
				...((await dispatch(name, args)) as object),
				exportJob,
				studioProcessId: process.pid,
			};
		if (name === "studio_snapshot")
			return (await editor().webContents.capturePage()).toPNG().toString("base64");
		if (name === "studio_cancel_export") {
			if (exportJob?.state !== "running") throw new Error("No agent export is running");
			return dispatch(name, args);
		}
		if (mutationBusy || exportJob?.state === "running")
			throw new Error("Studio is busy; inspect studio_status and retry after completion");
		mutationBusy = true;
		try {
			if (name === "studio_open_project") {
				const loaded = await files.loadProject(args.path as string);
				return await dispatch(name, loaded);
			}
			if (name === "studio_save_copy") {
				const snapshot = (await dispatch(name, args)) as { project: unknown; snapshot: string };
				const saved = await files.writeNew(
					args.path as string,
					".openscreen",
					JSON.stringify(snapshot.project, null, 2),
				);
				await dispatch("studio_copy_saved", { path: saved, snapshot: snapshot.snapshot });
				return { path: saved };
			}
			if (name === "studio_export") {
				const target = await files.newPath(args.path as string, ".mp4");
				// Validate readiness/revision before accepting a background export job.
				await dispatch("studio_check_export", args);
				exportJob = { id: randomUUID(), state: "running", path: target };
				exportTarget = target;
				const job = exportJob;
				void dispatch(name, { ...args, path: target }, 6 * 60 * 60 * 1000)
					.then(
						() => {
							job.state = "completed";
						},
						(error: Error) => {
							job.state = "failed";
							job.error = error.message;
						},
					)
					.finally(() => {
						exportTarget = null;
					});
				return { ...job };
			}
			return await dispatch(name, args);
		} finally {
			mutationBusy = false;
		}
	}

	const clients = new Set<net.Socket>();
	let requestsInFlight = 0;
	const server = net.createServer((client) => {
		if (clients.size >= 4) {
			client.destroy();
			return;
		}
		clients.add(client);
		client.on("error", () => client.destroy());
		client.on("close", () => clients.delete(client));
		const decoder = new StringDecoder("utf8");
		let buffer = "";
		client.on("data", (data) => {
			buffer += decoder.write(data);
			if (Buffer.byteLength(buffer) > 1024 * 1024) {
				client.destroy();
				return;
			}
			while (buffer.includes("\n")) {
				const newline = buffer.indexOf("\n");
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				if (requestsInFlight >= 64) {
					client.destroy();
					return;
				}
				requestsInFlight++;
				void (async () => {
					let envelope;
					try {
						envelope = JSON.parse(line);
					} catch {
						client.write(`${JSON.stringify(rpcError(null, -32700, "Parse error"))}\n`);
						return;
					}
					const supplied =
						typeof envelope?.token === "string" ? Buffer.from(envelope.token) : Buffer.alloc(0);
					const secret = Buffer.from(token);
					if (supplied.length !== secret.length || !timingSafeEqual(supplied, secret)) {
						client.destroy();
						return;
					}
					const response = await handleStudioRpc(envelope.request, execute);
					if (response !== undefined && !client.destroyed)
						client.write(`${JSON.stringify(response)}\n`);
				})()
					.catch(() => client.destroy())
					.finally(() => {
						requestsInFlight--;
					});
			}
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socket, resolve);
	});
	app.once("will-quit", () => {
		server.close();
		for (const client of clients) client.destroy();
		for (const entry of pending.values()) {
			clearTimeout(entry.timer);
			entry.cleanup();
			entry.reject(new Error("Studio closed"));
		}
		pending.clear();
	});
}
