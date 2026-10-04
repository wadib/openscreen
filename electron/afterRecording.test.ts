import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	access: vi.fn(),
	spawn: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ default: mocks }));
vi.mock("node:child_process", () => ({ default: { spawn: mocks.spawn }, spawn: mocks.spawn }));
vi.mock("electron", () => ({ app: { getPath: () => "C:/preferences" } }));

import { launchExternalEditor, readAfterRecording, writeAfterRecording } from "./afterRecording";

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
	it("persists direct export", async () => {
		expect(await writeAfterRecording({ mode: "export" })).toEqual({ mode: "export" });
		expect(mocks.writeFile).toHaveBeenCalledWith(
			expect.any(String),
			JSON.stringify({ mode: "export" }),
		);
	});
	it("persists an opt-in quiet choice and disables it without changing export mode", async () => {
		const candidate = { mode: "export" as const, quietRecording: true };
		expect(await writeAfterRecording(candidate)).toEqual(candidate);
		mocks.readFile.mockResolvedValue(JSON.stringify(candidate));
		expect(await readAfterRecording()).toEqual(candidate);
		expect(await writeAfterRecording({ mode: "export", quietRecording: false })).toEqual({
			mode: "export",
		});
	});
	it.each([
		"editor",
		"export",
		"external",
	] as const)("persists independent hiding choices in %s mode", async (mode) => {
		const candidate = {
			mode,
			...(mode === "external" ? { editorPath: "C:/Editor/editor.exe" } : {}),
			quietRecording: true,
			hideAfterRecording: true,
			hideAfterVideo: true,
		};
		expect(await writeAfterRecording(candidate)).toEqual(candidate);
		mocks.readFile.mockResolvedValue(JSON.stringify(candidate));
		expect(await readAfterRecording()).toEqual(candidate);
		expect(await writeAfterRecording({ ...candidate, hideAfterRecording: false })).toEqual({
			...candidate,
			hideAfterRecording: undefined,
		});
		expect(await writeAfterRecording({ ...candidate, hideAfterVideo: false })).toEqual({
			...candidate,
			hideAfterVideo: undefined,
		});
	});
	it.each([
		"hideAfterRecording",
		"hideAfterVideo",
	])("rejects malformed %s without replacing preferences", async (key) => {
		await expect(writeAfterRecording({ mode: "editor", [key]: "true" })).rejects.toThrow(
			`Invalid ${key} setting`,
		);
		expect(mocks.writeFile).not.toHaveBeenCalled();
	});
	it("ignores malformed hide choices when reading an existing preference file", async () => {
		mocks.readFile.mockResolvedValue(
			JSON.stringify({
				mode: "export",
				hideAfterRecording: "true",
				hideAfterVideo: 1,
			}),
		);
		expect(await readAfterRecording()).toEqual({ mode: "export" });
	});
	it("rejects a malformed quiet choice without replacing preferences", async () => {
		await expect(writeAfterRecording({ mode: "editor", quietRecording: "true" })).rejects.toThrow(
			"Invalid quiet recording",
		);
		expect(mocks.writeFile).not.toHaveBeenCalled();
	});
	it.each([
		null,
		{ mode: "unknown" },
		{ mode: "external", editorPath: "relative.exe" },
	])("rejects invalid settings without replacing preferences", async (settings) => {
		await expect(writeAfterRecording(settings)).rejects.toThrow("Invalid recording settings");
		expect(mocks.writeFile).not.toHaveBeenCalled();
	});
	it("validates the chosen external editor before saving", async () => {
		expect(
			await writeAfterRecording({ mode: "external", editorPath: "C:/Editor/editor.exe" }),
		).toEqual({ mode: "external", editorPath: "C:/Editor/editor.exe" });
		expect(mocks.access).toHaveBeenCalledWith("C:/Editor/editor.exe");
		mocks.writeFile.mockClear();
		mocks.access.mockRejectedValueOnce(new Error("missing editor"));
		await expect(
			writeAfterRecording({ mode: "external", editorPath: "C:/Editor/gone.exe" }),
		).rejects.toThrow("missing editor");
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
