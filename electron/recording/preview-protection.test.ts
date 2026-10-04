import { afterEach, describe, expect, it, vi } from "vitest";
import { protectRecordingPreview } from "./preview-protection";

afterEach(() => vi.useRealTimers());

function windowStub() {
	return {
		isDestroyed: vi.fn(() => false),
		isContentProtected: vi.fn(() => false),
		setContentProtection: vi.fn(),
	};
}

describe("protectRecordingPreview", () => {
	it("accepts protection immediately when Windows is ready", async () => {
		const win = windowStub();
		win.isContentProtected.mockReturnValue(true);
		await protectRecordingPreview(win);
		expect(win.setContentProtection).toHaveBeenCalledWith(true);
	});

	it("waits for delayed first-show initialization", async () => {
		vi.useFakeTimers();
		const win = windowStub();
		const pending = protectRecordingPreview(win);
		await vi.advanceTimersByTimeAsync(500);
		win.isContentProtected.mockReturnValue(true);
		await vi.advanceTimersByTimeAsync(25);
		await pending;
		expect(win.setContentProtection.mock.calls.length).toBeGreaterThan(1);
	});

	it("fails closed after the bounded protection timeout", async () => {
		vi.useFakeTimers();
		const pending = protectRecordingPreview(windowStub());
		const result = expect(pending).rejects.toThrow("capture exclusion failed");
		await vi.advanceTimersByTimeAsync(2_000);
		await result;
	});

	it("stops polling when the window closes during initialization", async () => {
		vi.useFakeTimers();
		const win = windowStub();
		const pending = protectRecordingPreview(win);
		const result = expect(pending).rejects.toThrow("capture exclusion failed");
		win.isDestroyed.mockReturnValue(true);
		await vi.advanceTimersByTimeAsync(25);
		await result;
		expect(win.setContentProtection).toHaveBeenCalledTimes(1);
	});
});
