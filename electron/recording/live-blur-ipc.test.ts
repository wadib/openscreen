import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	handlers: new Map<string, (event: { sender: { id: number } }, selected?: unknown) => unknown>(),
	open: vi.fn(),
	get: vi.fn(),
	set: vi.fn(),
}));
vi.mock("electron", () => ({
	ipcMain: {
		handle: (
			name: string,
			handler: (event: { sender: { id: number } }, selected?: unknown) => unknown,
		) => mocks.handlers.set(name, handler),
	},
	BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock("./blurry-settings", () => ({
	openBlurrySettings: mocks.open,
	getBlurrySelected: mocks.get,
	setBlurrySelected: mocks.set,
}));
vi.mock("../windows", () => ({
	isRecorderWindow: (id: number) => id === 1,
	getRecordingPreviewConfiguration: (id: number) => (id === 2 ? {} : undefined),
}));

import { registerLiveBlurHandlers } from "./live-blur";

beforeEach(() => {
	mocks.handlers.clear();
	mocks.open.mockReset().mockResolvedValue(undefined);
	mocks.get.mockReset().mockResolvedValue(false);
	mocks.set.mockReset().mockImplementation(async (selected) => selected);
	registerLiveBlurHandlers(() => undefined);
});
it("Blur only opens original settings, without requiring or changing a recording source", async () => {
	await mocks.handlers.get("open-blurry-settings")!({ sender: { id: 1 } });
	expect(mocks.open).toHaveBeenCalledTimes(1);
	expect(mocks.handlers.has("set-live-blur-controls-open")).toBe(false);
});
it("does not allow Preview or Studio to summon the original settings", () => {
	for (const id of [2, 3])
		expect(() => mocks.handlers.get("open-blurry-settings")!({ sender: { id } })).toThrow(
			"Recorder window required",
		);
	expect(mocks.open).not.toHaveBeenCalled();
});
it("toggles only through the original companion and validates input", async () => {
	const event = { sender: { id: 1 } };
	expect(await mocks.handlers.get("set-blurry-selected")!(event, true)).toBe(true);
	expect(await mocks.handlers.get("set-blurry-selected")!(event, false)).toBe(false);
	expect(mocks.set.mock.calls).toEqual([[true], [false]]);
	expect(() => mocks.handlers.get("set-blurry-selected")!(event, "false")).toThrow("boolean");
});
it("restricts selection state and reset to the recorder", () => {
	for (const id of [2, 3]) {
		const event = { sender: { id } };
		expect(() => mocks.handlers.get("get-blurry-selected")!(event)).toThrow(
			"Recorder window required",
		);
		expect(() => mocks.handlers.get("set-blurry-selected")!(event, false)).toThrow(
			"Recorder window required",
		);
	}
	expect(mocks.get).not.toHaveBeenCalled();
	expect(mocks.set).not.toHaveBeenCalled();
});
