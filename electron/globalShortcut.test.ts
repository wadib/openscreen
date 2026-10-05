import fs from "node:fs/promises";
import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SHORTCUTS } from "../src/lib/shortcuts";
import {
	loadAndRegisterGlobalShortcuts,
	registerGlobalShortcuts,
	unregisterAllGlobalShortcuts,
} from "./globalShortcut";

const mocks = vi.hoisted(() => ({
	register: vi.fn(),
	unregister: vi.fn(),
	unregisterAll: vi.fn(),
}));

vi.mock("electron", () => ({ globalShortcut: mocks }));
vi.mock("./ipc/handlers", () => ({ SHORTCUTS_FILE: "shortcuts.json" }));
vi.mock("node:fs/promises", () => ({ default: { readFile: vi.fn() } }));

const callbacks = {
	openApp: vi.fn(),
	toggleRecording: vi.fn(),
	togglePaused: vi.fn(),
};

beforeEach(() => {
	unregisterAllGlobalShortcuts();
	vi.clearAllMocks();
	mocks.register.mockReturnValue(true);
});

it("registers open, record and pause as global shortcuts", () => {
	expect(registerGlobalShortcuts(DEFAULT_SHORTCUTS, callbacks)).toBe(true);
	expect(mocks.register.mock.calls.map(([accelerator]) => accelerator)).toEqual([
		"CommandOrControl+Shift+O",
		"CommandOrControl+Shift+R",
		"CommandOrControl+Shift+P",
	]);
});

it("merges new recording shortcuts into an older saved config", async () => {
	vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ openApp: DEFAULT_SHORTCUTS.openApp }));
	await loadAndRegisterGlobalShortcuts(callbacks);
	expect(mocks.register).toHaveBeenCalledWith(
		"CommandOrControl+Shift+R",
		callbacks.toggleRecording,
	);
	expect(mocks.register).toHaveBeenCalledWith("CommandOrControl+Shift+P", callbacks.togglePaused);
});

it("restores the previous registration when a new accelerator is unavailable", () => {
	expect(registerGlobalShortcuts(DEFAULT_SHORTCUTS, callbacks)).toBe(true);
	mocks.register.mockImplementation((accelerator: string) => !accelerator.endsWith("+X"));
	const changed = {
		...DEFAULT_SHORTCUTS,
		toggleRecording: { key: "x", ctrl: true, shift: true },
	};
	expect(registerGlobalShortcuts(changed, callbacks)).toBe(false);
	expect(
		mocks.register.mock.calls.filter(([value]) => value === "CommandOrControl+Shift+R"),
	).toHaveLength(2);
});
