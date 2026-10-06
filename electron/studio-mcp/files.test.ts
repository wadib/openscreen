// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StudioFiles } from "./files";

describe("Studio MCP file boundary", () => {
	let temp: string;
	let root: string;
	let files: StudioFiles;
	beforeEach(async () => {
		temp = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-mcp-unit-"));
		root = path.join(temp, "allowed");
		await fs.mkdir(root);
		files = await StudioFiles.create([root]);
	});
	afterEach(async () => {
		await fs.rm(temp, { recursive: true, force: true });
	});
	it("requires explicit existing local folders", async () => {
		await expect(StudioFiles.create([])).rejects.toThrow();
		await expect(StudioFiles.create(["https://example.invalid"])).rejects.toThrow();
		await expect(StudioFiles.create([path.join(temp, "missing")])).rejects.toThrow();
	});
	it("writes a new copy but never overwrites an existing file", async () => {
		const target = path.join(root, "copy.openscreen");
		await files.writeNew(target, ".openscreen", "first");
		await expect(files.writeNew(target, ".openscreen", "second")).rejects.toThrow("already exists");
		expect(await fs.readFile(target, "utf8")).toBe("first");
	});
	it("rejects traversal, sibling prefixes, wrong extensions and remote paths", async () => {
		await fs.mkdir(path.join(temp, "allowed-sibling"));
		for (const value of [
			path.join(root, "..", "escaped.openscreen"),
			path.join(temp, "allowed-sibling", "copy.openscreen"),
			"https://example.invalid/project.openscreen",
			"\\\\server\\share\\copy.openscreen",
		]) {
			await expect(files.newPath(value, ".openscreen")).rejects.toThrow();
		}
		await expect(files.newPath(path.join(root, "script.js"), ".openscreen")).rejects.toThrow();
	});
	it("resolves junctions before approving reads and writes", async () => {
		const outside = path.join(temp, "outside");
		await fs.mkdir(outside);
		await fs.writeFile(path.join(outside, "source.mp4"), "source");
		await fs.symlink(
			outside,
			path.join(root, "link"),
			process.platform === "win32" ? "junction" : "dir",
		);
		await expect(files.readPath(path.join(root, "link", "source.mp4"))).rejects.toThrow("outside");
		await expect(files.newPath(path.join(root, "link", "copy.mp4"), ".mp4")).rejects.toThrow(
			"outside",
		);
	});
	it("validates every project media path and denies remote wallpaper", async () => {
		const media = path.join(root, "source.mp4");
		await fs.writeFile(media, "source");
		const project = path.join(root, "source.openscreen");
		await fs.writeFile(
			project,
			JSON.stringify({
				version: 2,
				media: { screenVideoPath: media },
				editor: { wallpaper: "#123456" },
			}),
		);
		expect((await files.loadProject(project)).project.media.screenVideoPath).toBe(media);
		await fs.writeFile(
			project,
			JSON.stringify({
				version: 2,
				media: { screenVideoPath: media, microphoneAudioPath: path.join(temp, "outside.wav") },
				editor: {},
			}),
		);
		await expect(files.loadProject(project)).rejects.toThrow();
		await fs.writeFile(
			project,
			JSON.stringify({
				version: 2,
				media: { screenVideoPath: media },
				editor: {
					annotationRegions: [
						{ type: "image", imageContent: `file:///${path.join(temp, "private.png")}` },
					],
				},
			}),
		);
		await expect(files.loadProject(project)).rejects.toThrow("embed raster");
		await fs.writeFile(
			project,
			JSON.stringify({
				version: 2,
				media: { screenVideoPath: media },
				editor: { wallpaper: "https://example.invalid/asset.jpg" },
			}),
		);
		await expect(files.loadProject(project)).rejects.toThrow();
	});
	it("exclusive creation rejects concurrent attempts", async () => {
		const results = await Promise.allSettled([
			files.writeNew(path.join(root, "race.mp4"), ".mp4", "a"),
			files.writeNew(path.join(root, "race.mp4"), ".mp4", "b"),
		]);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	});
});
