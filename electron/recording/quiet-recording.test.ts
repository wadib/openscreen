import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { launchQuietRecording, QuietRecordingController } from "./quiet-recording";
import { quietRecordingCommand } from "./quiet-recording-scripts";

function fakeProcess(message: object, code = 0) {
	const child = Object.assign(new EventEmitter(), {
		stdin: new PassThrough(),
		stdout: new PassThrough(),
		stderr: new PassThrough(),
	});
	child.stdin.once("finish", () => queueMicrotask(() => child.emit("close", code)));
	const spawn = vi.fn(() => {
		queueMicrotask(() => child.stdout.write(JSON.stringify(message) + "\n"));
		return child;
	});
	return { child, spawn };
}

describe("quiet recording", () => {
	it.skipIf(process.platform !== "win32" || process.env.OPENSCREEN_TEST_REAL_QUIET !== "1")(
		"activates and restores the real Windows quiet-hours profile",
		async () => {
			const lease = await launchQuietRecording("win32");
			try {
				expect(lease.backend).toBe("Windows Focus / Quiet Hours");
			} finally {
				await lease.release();
			}
		},
		30_000,
	);
	it.each(["win32", "darwin", "linux"] as const)("selects a dedicated %s adapter", (platform) => {
		const command = quietRecordingCommand(platform);
		expect(command.file).toBeTruthy();
		expect(command.args.length).toBeGreaterThan(0);
	});
	it("does not substitute a Windows adapter on unsupported systems", () => {
		expect(() => quietRecordingCommand("aix")).toThrow("unavailable");
	});
	it("encodes Windows scripts losslessly and restores the prior profile in finally", () => {
		const command = quietRecordingCommand("win32");
		const script = Buffer.from(command.args.at(-1)!, "base64").toString("utf16le");
		expect(script).toContain("GetSelected");
		expect(script).toContain("finally");
		expect(script).toContain("[QuietState]::Set($previous)");
	});
	it("waits for confirmation and releases its helper only once", async () => {
		const { child, spawn } = fakeProcess({ ready: true, backend: "test" });
		const lease = await launchQuietRecording("linux", false, undefined, spawn as never);
		expect(child.stdin.writableEnded).toBe(false);
		await Promise.all([lease.release(), lease.release()]);
		expect(child.stdin.writableEnded).toBe(true);
		expect(spawn.mock.calls).toHaveLength(1);
	});
	it("probes availability without acquiring a lasting lease", async () => {
		const { child, spawn } = fakeProcess({ ready: true, backend: "test" });
		await launchQuietRecording("darwin", true, undefined, spawn as never);
		expect(child.stdin.writableEnded).toBe(true);
	});
	it("passes parent identity so the Windows guardian does not depend only on pipe EOF", async () => {
		const { spawn } = fakeProcess({ ready: true, backend: "test" });
		const lease = await launchQuietRecording("win32", false, undefined, spawn as never);
		expect(spawn).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(Array),
			expect.objectContaining({
				windowsHide: true,
				detached: true,
				env: expect.objectContaining({ OPENSCREEN_QUIET_PARENT_PID: String(process.pid) }),
			}),
		);
		await lease.release();
	});
	it("rejects unconfirmed quiet mode and still closes its helper", async () => {
		const { child, spawn } = fakeProcess({ error: "permission denied" });
		await expect(launchQuietRecording("linux", false, undefined, spawn as never)).rejects.toThrow(
			"permission denied",
		);
		expect(child.stdin.writableEnded).toBe(true);
	});
	it("reports restoration failures rather than silently claiming success", async () => {
		const { child, spawn } = fakeProcess({ ready: true, backend: "test" }, 1);
		const lease = await launchQuietRecording("linux", false, undefined, spawn as never);
		child.stderr.write("restoration failed");
		await expect(lease.release()).rejects.toThrow("restoration failed");
	});
	it("reports loss of a helper during recording", async () => {
		const { child, spawn } = fakeProcess({ ready: true, backend: "test" });
		const lost = vi.fn();
		const lease = await launchQuietRecording("linux", false, lost, spawn as never);
		child.emit("close", 0);
		expect(lost).toHaveBeenCalledOnce();
		await lease.release();
	});
	it("serializes canceled starts and cannot leave a late lease active", async () => {
		let finish!: (value: { backend: string; release: () => Promise<void> }) => void;
		const release = vi.fn(async () => undefined);
		const controller = new QuietRecordingController(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const start = controller.start();
		const stop = controller.stop();
		await Promise.resolve();
		finish({ backend: "test", release });
		await Promise.all([start, stop]);
		expect(release).toHaveBeenCalledOnce();
	});
	it("keeps a single lease for repeated starts and handles repeated stops", async () => {
		const release = vi.fn(async () => undefined);
		const acquire = vi.fn(async () => ({ backend: "test", release }));
		const controller = new QuietRecordingController(acquire);
		await Promise.all([controller.start(), controller.start()]);
		await Promise.all([controller.stop(), controller.stop()]);
		expect(acquire).toHaveBeenCalledOnce();
		expect(release).toHaveBeenCalledOnce();
	});
	it("can retry after an unavailable backend without disabling normal recording", async () => {
		const acquire = vi
			.fn()
			.mockRejectedValueOnce(new Error("unavailable"))
			.mockResolvedValue({ backend: "test", release: async () => undefined });
		const controller = new QuietRecordingController(acquire);
		await expect(controller.start()).rejects.toThrow("unavailable");
		await controller.start();
		await controller.stop();
	});
});
