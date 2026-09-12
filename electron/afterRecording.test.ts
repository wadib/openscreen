import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	access: vi.fn(),
	spawn: vi.fn(),
	showMessageBox: vi.fn(),
	showOpenDialog: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ default: mocks }));
vi.mock("node:child_process", () => ({ default: { spawn: mocks.spawn }, spawn: mocks.spawn }));
vi.mock("electron", () => ({ app: { getPath: () => "C:/preferences" }, dialog: mocks }));

import {
	configureAfterRecording,
	launchExternalEditor,
	readAfterRecording,
} from "./afterRecording";

describe("after recording", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.readFile.mockRejectedValue(new Error("missing"));
		mocks.writeFile.mockResolvedValue(undefined);
		mocks.access.mockResolvedValue(undefined);
	});
	it("keeps the original editor behavior for missing or malformed preferences", async () => {
		expect(await readAfterRecording()).toEqual({ mode: "editor" });
		mocks.readFile.mockResolvedValue("not json");
		expect(await readAfterRecording()).toEqual({ mode: "editor" });
		mocks.readFile.mockResolvedValue(
			JSON.stringify({ mode: "external", editorPath: "relative.exe" }),
		);
		expect(await readAfterRecording()).toEqual({ mode: "editor" });
	});
	it("persists direct export and honors cancellation", async () => {
		mocks.showMessageBox.mockResolvedValue({ response: 2 });
		expect(await configureAfterRecording()).toEqual({ mode: "export" });
		expect(mocks.writeFile).toHaveBeenCalledWith(
			expect.any(String),
			JSON.stringify({ mode: "export" }),
		);
		mocks.writeFile.mockClear();
		mocks.showMessageBox.mockResolvedValue({ response: 3 });
		await configureAfterRecording();
		expect(mocks.writeFile).not.toHaveBeenCalled();
	});
	it("does not replace the saved editor when executable selection is cancelled", async () => {
		mocks.showMessageBox.mockResolvedValue({ response: 1 });
		mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
		expect(await configureAfterRecording()).toEqual({ mode: "editor" });
		expect(mocks.writeFile).not.toHaveBeenCalled();
	});
	it("launches the editor with a single file argument and no shell", async () => {
		const child = { once: vi.fn(), unref: vi.fn() };
		child.once.mockImplementation((event: string, callback: () => void) => {
			if (event === "spawn") callback();
			return child;
		});
		mocks.spawn.mockReturnValue(child);
		await launchExternalEditor("C:/Editor/editor.exe", "C:/Video/a & b.mp4");
		expect(mocks.spawn).toHaveBeenCalledWith("C:/Editor/editor.exe", ["C:/Video/a & b.mp4"], {
			detached: true,
			stdio: "ignore",
			shell: false,
		});
		expect(child.unref).toHaveBeenCalled();
	});
});
