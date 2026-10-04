import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	spawn: vi.fn(),
	exists: vi.fn(),
	connect: vi.fn(),
}));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn, default: { spawn: mocks.spawn } }));
vi.mock("node:fs", () => ({ default: { existsSync: mocks.exists } }));
vi.mock("node:net", () => ({ default: { createConnection: mocks.connect } }));
vi.mock("electron", () => ({ app: { getAppPath: () => "D:/REPOS/openscreen" } }));

import {
	blurryExecutableCandidates,
	getBlurrySelected,
	openBlurrySettings,
	setBlurrySelected,
} from "./blurry-settings";

class Socket extends EventEmitter {
	destroy = vi.fn();
	setTimeout = vi.fn();
	response = "opened";
	write = vi.fn((_command: string) =>
		queueMicrotask(() => this.emit("data", Buffer.from(this.response + "\n"))),
	);
}

describe("original Blurry settings launcher", () => {
	beforeEach(() => {
		vi.stubEnv("OPENSCREEN_BLURRY_EXE", "D:/Blurry/Blurry.exe");
		mocks.exists.mockReset().mockReturnValue(true);
		mocks.connect.mockReset().mockImplementation(() => {
			const socket = new Socket();
			queueMicrotask(() =>
				socket.emit("error", Object.assign(new Error("not running"), { code: "ENOENT" })),
			);
			return socket;
		});
		mocks.spawn.mockReset().mockImplementation(() => {
			const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
			queueMicrotask(() => child.emit("spawn"));
			return child;
		});
	});
	afterEach(() => vi.unstubAllEnvs());

	it("resets through targeted Escape and waits for acknowledgement", async () => {
		const socket = new Socket();
		socket.response = "cleared";
		mocks.connect.mockImplementation(() => {
			queueMicrotask(() => socket.emit("connect"));
			return socket;
		});
		expect(await setBlurrySelected(false)).toBe(false);
		expect(socket.write).toHaveBeenCalledWith("escape\n");
		expect(mocks.spawn).not.toHaveBeenCalled();
	});
	it("deselects without launching Blurry when it has already exited", async () => {
		expect(await setBlurrySelected(false)).toBe(false);
		expect(await getBlurrySelected()).toBe(false);
		expect(mocks.spawn).not.toHaveBeenCalled();
	});
	it("does not report a reset as successful when the native app rejects it", async () => {
		mocks.connect.mockImplementation(() => {
			const socket = new Socket();
			socket.response = "unsupported";
			queueMicrotask(() => socket.emit("connect"));
			return socket;
		});
		await expect(setBlurrySelected(false)).rejects.toThrow("did not acknowledge Escape");
	});
	it("reports native selection state", async () => {
		for (const [response, expected] of [
			["selected", true],
			["idle", false],
		] as const) {
			mocks.connect.mockImplementation(() => {
				const socket = new Socket();
				socket.response = response;
				queueMicrotask(() => socket.emit("connect"));
				return socket;
			});
			expect(await getBlurrySelected()).toBe(expected);
		}
	});
	it("selects only after opening and reading native selected state", async () => {
		mocks.connect.mockImplementation(() => {
			const socket = new Socket();
			socket.write.mockImplementation(() =>
				queueMicrotask(() =>
					socket.emit(
						"data",
						Buffer.from(
							socket.write.mock.calls.length && socket.write.mock.calls[0][0] === "settings\n"
								? "opened\n"
								: "selected\n",
						),
					),
				),
			);
			queueMicrotask(() => socket.emit("connect"));
			return socket;
		});
		expect(await setBlurrySelected(true)).toBe(true);
		expect(mocks.spawn).not.toHaveBeenCalled();
	});
	it("keeps transport errors visible instead of claiming that blur was cleared", async () => {
		mocks.connect.mockImplementation(() => {
			const socket = new Socket();
			queueMicrotask(() => socket.emit("error", new Error("permission denied")));
			return socket;
		});
		await expect(setBlurrySelected(false)).rejects.toThrow("permission denied");
	});
	it("honors an explicitly configured original executable without falling back", () => {
		expect(blurryExecutableCandidates()).toEqual(["D:/Blurry/Blurry.exe"]);
	});
	it("starts only the original app with no blur toggles or preview arguments", async () => {
		await openBlurrySettings();
		expect(mocks.spawn).toHaveBeenCalledExactlyOnceWith("D:/Blurry/Blurry.exe", [], {
			cwd: "D:/Blurry",
			detached: true,
			stdio: "ignore",
			windowsHide: true,
		});
	});
	it("reopens an existing native panel without launching another process", async () => {
		const socket = new Socket();
		mocks.connect.mockImplementation(() => {
			queueMicrotask(() => socket.emit("connect"));
			return socket;
		});
		await openBlurrySettings();
		expect(socket.write).toHaveBeenCalledWith("settings\n");
		expect(mocks.spawn).not.toHaveBeenCalled();
		expect(socket.destroy).toHaveBeenCalled();
	});
	it("coalesces simultaneous clicks", async () => {
		const first = openBlurrySettings();
		expect(openBlurrySettings()).toBe(first);
		await first;
		expect(mocks.spawn).toHaveBeenCalledTimes(1);
	});
	it("reports a missing original app instead of opening substitute settings", async () => {
		mocks.exists.mockReturnValue(false);
		await expect(openBlurrySettings()).rejects.toThrow("Original Blurry was not found");
		expect(mocks.spawn).not.toHaveBeenCalled();
	});
	it("allows retry after launch failure", async () => {
		mocks.spawn.mockImplementationOnce(() => {
			const child = new EventEmitter();
			queueMicrotask(() => child.emit("error", new Error("launch failed")));
			return child;
		});
		await expect(openBlurrySettings()).rejects.toThrow("launch failed");
		await openBlurrySettings();
		expect(mocks.spawn).toHaveBeenCalledTimes(2);
	});
});
