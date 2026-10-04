// @vitest-environment node
import type { EventEmitter } from "node:events";
import os from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./recording/preview-protection", () => ({ protectRecordingPreview: vi.fn() }));
vi.mock("electron", async () => {
	const { EventEmitter } = await import("node:events");
	class MockWindow extends EventEmitter {
		destroyed = false;
		contentsDestroyed = false;
		contents = Object.assign(new EventEmitter(), {
			isDestroyed: () => this.contentsDestroyed,
			insertCSS: vi.fn().mockResolvedValue(undefined),
			send: vi.fn(),
		});
		get webContents() {
			if (this.destroyed) throw new Error("Object has been destroyed");
			return this.contents;
		}
		isDestroyed() {
			return this.destroyed;
		}
		loadFile = vi.fn();
		loadURL = vi.fn();
		setSize = vi.fn();
	}
	return {
		BrowserWindow: MockWindow,
		ipcMain: { on: vi.fn(), handle: vi.fn() },
		screen: {},
		Menu: {},
	};
});
const oldResources = Object.getOwnPropertyDescriptor(process, "resourcesPath");
beforeEach(() =>
	Object.defineProperty(process, "resourcesPath", { configurable: true, value: os.tmpdir() }),
);
afterEach(() => {
	if (oldResources) Object.defineProperty(process, "resourcesPath", oldResources);
	else Reflect.deleteProperty(process, "resourcesPath");
});

it.each([
	"window",
	"contents",
])("ignores delayed editor load events after %s destruction", async (kind) => {
	const { createEditorWindow } = await import("./windows");
	const win = createEditorWindow(true) as unknown as {
		destroyed: boolean;
		contentsDestroyed: boolean;
		contents: EventEmitter & {
			insertCSS: ReturnType<typeof vi.fn>;
			send: ReturnType<typeof vi.fn>;
		};
	};
	if (kind === "window") win.destroyed = true;
	else win.contentsDestroyed = true;
	expect(() => win.contents.emit("dom-ready")).not.toThrow();
	expect(() => win.contents.emit("did-finish-load")).not.toThrow();
	expect(win.contents.insertCSS).not.toHaveBeenCalled();
	expect(win.contents.send).not.toHaveBeenCalled();
});

it("keeps styling and load notifications for a live editor", async () => {
	const { createEditorWindow } = await import("./windows");
	const win = createEditorWindow(true);
	win.webContents.emit("dom-ready");
	win.webContents.emit("did-finish-load");
	expect(win.webContents.insertCSS).toHaveBeenCalledOnce();
	expect(win.webContents.send).toHaveBeenCalledWith("main-process-message", expect.any(String));
});
