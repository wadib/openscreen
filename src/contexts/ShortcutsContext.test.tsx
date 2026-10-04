import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SHORTCUTS, type ShortcutsConfig } from "@/lib/shortcuts";
import { ShortcutsProvider, useShortcuts } from "./ShortcutsContext";

vi.mock("@/utils/platformUtils", () => ({ isMac: async () => false }));
let listener: (config: unknown) => void;
const unsubscribe = vi.fn();
const get = vi.fn();
const save = vi.fn();
beforeEach(() => {
	vi.clearAllMocks();
	get.mockResolvedValue(null);
	save.mockResolvedValue({ success: true });
	window.electronAPI = {
		getShortcuts: get,
		saveShortcuts: save,
		onShortcutsChanged: (callback: typeof listener) => {
			listener = callback;
			return unsubscribe;
		},
	} as unknown as typeof window.electronAPI;
});

it("loads partial saved shortcuts and marks them ready", async () => {
	get.mockResolvedValue({ addZoom: { key: "q" } });
	const { result } = renderHook(useShortcuts, { wrapper: ShortcutsProvider });
	await waitFor(() => expect(result.current.ready).toBe(true));
	expect(result.current.shortcuts.addZoom).toEqual({ key: "q" });
	expect(result.current.shortcuts.openApp).toEqual(DEFAULT_SHORTCUTS.openApp);
});

it("does not overwrite a live cross-window change with an older initial read", async () => {
	let resolve!: (config: ShortcutsConfig) => void;
	get.mockImplementation(
		() =>
			new Promise<ShortcutsConfig>((done) => {
				resolve = done;
			}),
	);
	const { result, unmount } = renderHook(useShortcuts, { wrapper: ShortcutsProvider });
	act(() => listener({ ...DEFAULT_SHORTCUTS, addZoom: { key: "q" } }));
	await act(async () => resolve(DEFAULT_SHORTCUTS));
	expect(result.current.shortcuts.addZoom).toEqual({ key: "q" });
	unmount();
	expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it("reports registration failure without changing the current config", async () => {
	save.mockResolvedValue({ success: false, error: "registration" });
	const { result } = renderHook(useShortcuts, { wrapper: ShortcutsProvider });
	await waitFor(() => expect(result.current.ready).toBe(true));
	expect(
		await result.current.persistShortcuts({ ...DEFAULT_SHORTCUTS, addZoom: { key: "q" } }),
	).toBe(false);
	expect(result.current.shortcuts.addZoom).toEqual(DEFAULT_SHORTCUTS.addZoom);
});

it("does not report a failed file write as successful persistence", async () => {
	save.mockResolvedValue({ success: false, error: "save" });
	const { result } = renderHook(useShortcuts, { wrapper: ShortcutsProvider });
	await waitFor(() => expect(result.current.ready).toBe(true));
	await expect(result.current.persistShortcuts(DEFAULT_SHORTCUTS)).rejects.toThrow("save");
});
