import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useBlurryToggle } from "./useBlurryToggle";

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
beforeEach(() => {
	vi.useFakeTimers();
	mocks.get.mockReset().mockResolvedValue(false);
	mocks.set.mockReset().mockImplementation(async (selected) => selected);
	mocks.error.mockReset();
	vi.stubGlobal("electronAPI", { getBlurrySelected: mocks.get, setBlurrySelected: mocks.set });
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
it("opens on select and sends reset on deselect", async () => {
	const { result } = renderHook(() => useBlurryToggle(true));
	await act(async () => Promise.resolve());
	await act(async () => result.current.toggle());
	expect(result.current.selected).toBe(true);
	await act(async () => result.current.toggle());
	expect(result.current.selected).toBe(false);
	expect(mocks.set.mock.calls).toEqual([[true], [false]]);
});
it("stays selected until reset succeeds and blocks duplicate clicks", async () => {
	mocks.get.mockResolvedValue(true);
	let finish!: (selected: boolean) => void;
	mocks.set.mockReturnValue(
		new Promise<boolean>((resolve) => {
			finish = resolve;
		}),
	);
	const { result } = renderHook(() => useBlurryToggle(true));
	await act(async () => Promise.resolve());
	act(() => {
		void result.current.toggle();
		void result.current.toggle();
	});
	expect(result.current.selected).toBe(true);
	expect(result.current.busy).toBe(true);
	expect(mocks.set).toHaveBeenCalledTimes(1);
	await act(async () => finish(false));
	expect(result.current.selected).toBe(false);
	expect(result.current.busy).toBe(false);
});
it("retains green state on reset failure", async () => {
	mocks.get.mockResolvedValue(true);
	mocks.set.mockRejectedValue(new Error("no Escape acknowledgement"));
	const { result } = renderHook(() => useBlurryToggle(true));
	await act(async () => Promise.resolve());
	await act(async () => result.current.toggle());
	expect(result.current.selected).toBe(true);
	expect(result.current.busy).toBe(false);
	expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("no Escape acknowledgement"));
});
it("tracks external Escape and companion exit through native state", async () => {
	mocks.get.mockResolvedValue(true);
	const { result } = renderHook(() => useBlurryToggle(true));
	await act(async () => Promise.resolve());
	expect(result.current.selected).toBe(true);
	mocks.get.mockResolvedValue(false);
	await act(async () => vi.advanceTimersByTimeAsync(1000));
	expect(result.current.selected).toBe(false);
});
it("does not let an older poll undo a completed click", async () => {
	let finish!: (selected: boolean) => void;
	mocks.get.mockReturnValue(
		new Promise<boolean>((resolve) => {
			finish = resolve;
		}),
	);
	const { result } = renderHook(() => useBlurryToggle(true));
	await act(async () => result.current.toggle());
	expect(result.current.selected).toBe(true);
	await act(async () => finish(false));
	expect(result.current.selected).toBe(true);
});
it("does nothing on unsupported platforms and stops polling on unmount", async () => {
	const disabled = renderHook(() => useBlurryToggle(false));
	await act(async () => disabled.result.current.toggle());
	expect(mocks.get).not.toHaveBeenCalled();
	expect(mocks.set).not.toHaveBeenCalled();
	disabled.unmount();
	const enabled = renderHook(() => useBlurryToggle(true));
	await act(async () => Promise.resolve());
	enabled.unmount();
	const calls = mocks.get.mock.calls.length;
	await act(async () => vi.advanceTimersByTimeAsync(3000));
	expect(mocks.get).toHaveBeenCalledTimes(calls);
});
