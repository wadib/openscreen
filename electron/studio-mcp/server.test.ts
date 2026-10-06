// @vitest-environment node

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", async () => {
	const { EventEmitter } = await import("node:events");
	const ipcMain = Object.assign(new EventEmitter(), {
		handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
		handle(name: string, callback: (...args: unknown[]) => Promise<unknown>) {
			this.handlers.set(name, callback);
		},
	});
	return { app: new EventEmitter(), ipcMain };
});

describe("Studio MCP local pipe", () => {
	let temp: string;
	let socketPath: string;
	let clients: net.Socket[];
	let contents: EventEmitter & {
		id: number;
		isDestroyed: () => boolean;
		getURL: () => string;
		send: ReturnType<typeof vi.fn>;
	};
	let electron: {
		app: EventEmitter;
		ipcMain: EventEmitter & { handlers: Map<string, (...args: unknown[]) => Promise<unknown>> };
	};
	let oldArgs: string[];
	let oldEnv: { token?: string; socket?: string; roots?: string };
	const token = "a".repeat(64);
	beforeEach(async () => {
		vi.resetModules();
		temp = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-mcp-pipe-test-"));
		socketPath =
			process.platform === "win32"
				? `\\\\.\\pipe\\openscreen-unit-${randomUUID()}`
				: path.join(temp, "studio.sock");
		oldArgs = [...process.argv];
		oldEnv = {
			token: process.env.OPENSCREEN_STUDIO_MCP_TOKEN,
			socket: process.env.OPENSCREEN_STUDIO_MCP_SOCKET,
			roots: process.env.OPENSCREEN_STUDIO_MCP_ROOTS,
		};
		process.argv.push("--studio-mcp");
		Object.assign(process.env, {
			OPENSCREEN_STUDIO_MCP_TOKEN: token,
			OPENSCREEN_STUDIO_MCP_SOCKET: socketPath,
			OPENSCREEN_STUDIO_MCP_ROOTS: JSON.stringify([temp]),
		});
		electron = (await import("electron")) as unknown as typeof electron;
		contents = Object.assign(new EventEmitter(), {
			id: 42,
			isDestroyed: () => false,
			getURL: () => "file:///studio/index.html?windowType=editor",
			send: vi.fn(),
		});
		clients = [];
		const { startStudioMcp } = await import("./server");
		await startStudioMcp(() => ({ isDestroyed: () => false, webContents: contents }) as never);
		electron.ipcMain.emit("studio-mcp-ready", { sender: { id: 42 } });
	});
	afterEach(async () => {
		electron.app.emit("will-quit");
		for (const client of clients) client.destroy();
		electron.app.removeAllListeners();
		electron.ipcMain.removeAllListeners();
		electron.ipcMain.handlers.clear();
		process.argv.splice(0, process.argv.length, ...oldArgs);
		for (const [key, value] of Object.entries({
			OPENSCREEN_STUDIO_MCP_TOKEN: oldEnv.token,
			OPENSCREEN_STUDIO_MCP_SOCKET: oldEnv.socket,
			OPENSCREEN_STUDIO_MCP_ROOTS: oldEnv.roots,
		})) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		await fs.rm(temp, { recursive: true, force: true });
	});
	const connect = async () => {
		const client = net.createConnection(socketPath);
		clients.push(client);
		await new Promise<void>((resolve, reject) => {
			client.once("connect", resolve);
			client.once("error", reject);
		});
		return client;
	};
	const request = (client: net.Socket, name: string, args: object = {}) =>
		new Promise<{ result: { isError?: boolean; content: { text: string }[] } }>(
			(resolve, reject) => {
				const timer = setTimeout(() => reject(new Error("No pipe response")), 2000);
				client.once("data", (data) => {
					clearTimeout(timer);
					resolve(JSON.parse(data.toString()));
				});
				client.write(
					`${JSON.stringify({ token, request: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } })}\n`,
				);
			},
		);
	it("disconnects callers that do not know the per-session token", async () => {
		const client = await connect();
		const closed = new Promise((resolve) => client.once("close", resolve));
		client.write(
			`${JSON.stringify({ token: "wrong", request: { jsonrpc: "2.0", id: 1, method: "tools/list" } })}\n`,
		);
		await closed;
		expect(contents.send).not.toHaveBeenCalled();
	});
	it("rejects oversized frames before dispatch", async () => {
		const client = await connect();
		const closed = new Promise((resolve) => client.once("close", resolve));
		client.write("x".repeat(1024 * 1024 + 1));
		await closed;
		expect(contents.send).not.toHaveBeenCalled();
	});
	it("accepts replies only from the target Studio renderer", async () => {
		const client = await connect();
		contents.send.mockImplementation((_channel, command) => {
			electron.ipcMain.emit(
				"studio-mcp-response",
				{ sender: { id: 999 } },
				{ id: command.id, result: { hijacked: true } },
			);
			setTimeout(
				() =>
					electron.ipcMain.emit(
						"studio-mcp-response",
						{ sender: { id: 42 } },
						{ id: command.id, result: { ready: true } },
					),
				10,
			);
		});
		const result = await request(client, "studio_status");
		expect(JSON.parse(result.result.content[0].text)).toMatchObject({ ready: true });
		expect(JSON.parse(result.result.content[0].text).hijacked).toBeUndefined();
	});
	it("fails pending commands when Studio is destroyed", async () => {
		const client = await connect();
		contents.send.mockImplementation(() => setTimeout(() => contents.emit("destroyed"), 10));
		const result = await request(client, "studio_status");
		expect(result.result.isError).toBe(true);
		expect(result.result.content[0].text).toContain("Studio closed");
	});
	it("refuses unsolicited or wrong-renderer export writes", async () => {
		const write = electron.ipcMain.handlers.get("studio-mcp-write-export")!;
		await expect(
			write({ sender: { id: 42 } }, new ArrayBuffer(4), path.join(temp, "export.mp4")),
		).rejects.toThrow("authorized");
		await expect(
			write({ sender: { id: 999 } }, new ArrayBuffer(4), path.join(temp, "export.mp4")),
		).rejects.toThrow("authorized");
	});
});
