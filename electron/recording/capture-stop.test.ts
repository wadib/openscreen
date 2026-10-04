// @vitest-environment node
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureStopPendingError, waitForCaptureStop } from "./capture-stop";

function child() {
	return Object.assign(new EventEmitter(), {
		exitCode: null as number | null,
		signalCode: null,
		kill: vi.fn(),
	});
}
afterEach(() => vi.useRealTimers());
describe("capture finalization", () => {
	it("never terminates a slow writer and permits a later retry", async () => {
		vi.useFakeTimers();
		const proc = child();
		const pending = waitForCaptureStop(
			proc as ChildProcessWithoutNullStreams,
			"saved.mp4",
			() => "",
		);
		const assertion = expect(pending).rejects.toBeInstanceOf(CaptureStopPendingError);
		await vi.advanceTimersByTimeAsync(15_000);
		await assertion;
		expect(proc.kill).not.toHaveBeenCalled();
		expect(proc.listenerCount("close")).toBe(0);
		expect(proc.listenerCount("error")).toBe(0);
		const retry = waitForCaptureStop(
			proc as ChildProcessWithoutNullStreams,
			"saved.mp4",
			() => "Recording stopped. Output path: final.mp4\n",
		);
		proc.emit("close", 0);
		await expect(retry).resolves.toBe("final.mp4");
	});
	it("rejects a failed helper even if it printed a success message", async () => {
		const proc = child();
		const result = waitForCaptureStop(
			proc as ChildProcessWithoutNullStreams,
			"saved.mp4",
			() => "Recording stopped. Output path: saved.mp4\nEncoder failed",
		);
		proc.emit("close", 1);
		await expect(result).rejects.toThrow("Encoder failed");
		expect(proc.kill).not.toHaveBeenCalled();
	});
	it("handles a helper that has already exited successfully", async () => {
		const proc = child();
		proc.exitCode = 0;
		await expect(
			waitForCaptureStop(proc as ChildProcessWithoutNullStreams, "saved.mp4", () => ""),
		).resolves.toBe("saved.mp4");
	});
	it("preserves process errors and releases its listeners", async () => {
		const proc = child();
		const result = waitForCaptureStop(
			proc as ChildProcessWithoutNullStreams,
			"saved.mp4",
			() => "",
		);
		proc.emit("error", new Error("broken pipe"));
		await expect(result).rejects.toThrow("broken pipe");
		expect(proc.listenerCount("close")).toBe(0);
		expect(proc.kill).not.toHaveBeenCalled();
	});
});
