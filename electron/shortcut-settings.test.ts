import fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SHORTCUTS } from "../src/lib/shortcuts";
import { registerGlobalShortcuts } from "./globalShortcut";
import { createShortcutsSaver } from "./shortcut-settings";

vi.mock("node:fs/promises", () => ({
	default: {
		readFile: vi.fn(),
		writeFile: vi.fn(),
		rename: vi.fn(),
		rm: vi.fn(),
	},
}));
vi.mock("./globalShortcut", () => ({ registerGlobalShortcuts: vi.fn() }));

const callbacks = {
	openApp: vi.fn(),
	toggleRecording: vi.fn(),
	togglePaused: vi.fn(),
};

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(DEFAULT_SHORTCUTS));
	vi.mocked(fs.writeFile).mockResolvedValue();
	vi.mocked(fs.rename).mockResolvedValue();
	vi.mocked(fs.rm).mockResolvedValue();
	vi.mocked(registerGlobalShortcuts).mockReturnValue(true);
});

describe("shortcut settings saves", () => {
	it("registers, atomically saves and then announces confirmed changes", async () => {
		const changed = vi.fn();
		const config = { ...DEFAULT_SHORTCUTS, addZoom: { key: "q" } };
		expect(await createShortcutsSaver("shortcuts.json", callbacks, changed)(config)).toEqual({
			success: true,
		});
		expect(registerGlobalShortcuts).toHaveBeenCalledWith(config, callbacks);
		expect(fs.writeFile).toHaveBeenCalledWith(
			"shortcuts.json.tmp",
			JSON.stringify(config, null, 2),
			"utf-8",
		);
		expect(fs.rename).toHaveBeenCalledWith("shortcuts.json.tmp", "shortcuts.json");
		expect(changed).toHaveBeenCalledWith(config);
		expect(vi.mocked(fs.rename).mock.invocationCallOrder[0]).toBeLessThan(
			changed.mock.invocationCallOrder[0],
		);
	});

	it("does not save an unavailable global shortcut", async () => {
		vi.mocked(registerGlobalShortcuts).mockReturnValue(false);
		const changed = vi.fn();
		expect(
			await createShortcutsSaver("shortcuts.json", callbacks, changed)(DEFAULT_SHORTCUTS),
		).toEqual({ success: false, error: "registration" });
		expect(fs.writeFile).not.toHaveBeenCalled();
		expect(changed).not.toHaveBeenCalled();
	});

	it.each([
		"write",
		"rename",
	])("restores the previous global binding after a %s failure", async (step) => {
		vi.mocked(step === "write" ? fs.writeFile : fs.rename).mockRejectedValueOnce(new Error("disk"));
		const changed = vi.fn();
		const next = { ...DEFAULT_SHORTCUTS, openApp: { key: "k", ctrl: true, shift: true } };
		expect(await createShortcutsSaver("shortcuts.json", callbacks, changed)(next)).toEqual({
			success: false,
			error: "save",
		});
		expect(registerGlobalShortcuts).toHaveBeenLastCalledWith(DEFAULT_SHORTCUTS, callbacks);
		expect(fs.rm).toHaveBeenCalledWith("shortcuts.json.tmp", { force: true });
		expect(changed).not.toHaveBeenCalled();
	});

	it.each([
		null,
		{ ...DEFAULT_SHORTCUTS, addZoom: { key: "t" } },
		{ ...DEFAULT_SHORTCUTS, addZoom: { key: "z", ctrl: true } },
		{ ...DEFAULT_SHORTCUTS, openApp: { key: "Control" } },
		{ ...DEFAULT_SHORTCUTS, openApp: { key: "p", ctrl: "yes" } },
	])("rejects malformed, duplicate and reserved bindings before registration", async (value) => {
		expect(await createShortcutsSaver("shortcuts.json", callbacks, vi.fn())(value)).toEqual({
			success: false,
			error: "invalid",
		});
		expect(registerGlobalShortcuts).not.toHaveBeenCalled();
	});

	it("serializes concurrent saves so temporary files do not collide", async () => {
		let release!: () => void;
		vi.mocked(fs.writeFile).mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				}),
		);
		const save = createShortcutsSaver("shortcuts.json", callbacks, vi.fn());
		const first = save(DEFAULT_SHORTCUTS);
		await vi.waitFor(() => expect(fs.writeFile).toHaveBeenCalledTimes(1));
		const second = save({ ...DEFAULT_SHORTCUTS, addZoom: { key: "q" } });
		await Promise.resolve();
		expect(fs.writeFile).toHaveBeenCalledTimes(1);
		release();
		await Promise.all([first, second]);
		expect(fs.rename).toHaveBeenCalledTimes(2);
	});
});
