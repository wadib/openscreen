import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	crossPlatformBasename,
	mediaPathCandidates,
	relativeMediaPath,
	resolvePortableMediaPaths,
	withPortableMediaPaths,
} from "./projectMediaPaths";

describe("portable project media paths", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-portable-"));
	});

	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	it("records media relative to the project when saving", () => {
		const projectFile = path.join(dir, "demo.openscreen");
		const saved = withPortableMediaPaths(
			{
				version: 2,
				editor: {},
				media: {
					screenVideoPath: path.join(dir, "media", "screen.mp4"),
					microphoneAudioPath: path.join(dir, "mic.webm"),
					relativePaths: { webcamVideoPath: "stale.webm" },
				},
			},
			projectFile,
		);
		expect(saved.media.relativePaths).toEqual({
			screenVideoPath: "media/screen.mp4",
			microphoneAudioPath: "mic.webm",
		});
	});

	it("leaves projects without media untouched", () => {
		const legacy = { version: 1, editor: {}, videoPath: "/x/y.mp4" };
		expect(withPortableMediaPaths(legacy, path.join(dir, "p.openscreen"))).toBe(legacy);
	});

	it("keeps absolute paths that still exist", async () => {
		const screen = path.join(dir, "screen.mp4");
		await fs.writeFile(screen, "x");
		const project = { version: 2, editor: {}, media: { screenVideoPath: screen } };
		const result = await resolvePortableMediaPaths(project, path.join(dir, "p.openscreen"));
		expect(result.project).toBe(project);
		expect(result.remapped).toEqual([]);
	});

	it("finds media moved with the project through the relative path", async () => {
		await fs.mkdir(path.join(dir, "media"));
		const moved = path.join(dir, "media", "screen.mp4");
		await fs.writeFile(moved, "x");
		const result = await resolvePortableMediaPaths(
			{
				version: 2,
				editor: {},
				media: {
					screenVideoPath: "D:\\REPOS\\old\\media\\screen.mp4",
					relativePaths: { screenVideoPath: "media/screen.mp4" },
				},
			},
			path.join(dir, "p.openscreen"),
		);
		expect(result.remapped).toEqual(["screenVideoPath"]);
		expect(result.project.media.screenVideoPath).toBe(moved);
	});

	it("falls back to a same-named file next to the project (Windows path on Linux)", async () => {
		const mic = path.join(dir, "recording-1_mic.webm");
		await fs.writeFile(mic, "x");
		await fs.writeFile(path.join(dir, "recording-1.mp4"), "x");
		const result = await resolvePortableMediaPaths(
			{
				version: 2,
				editor: {},
				media: {
					screenVideoPath: "D:\\REPOS\\trmms\\recording-1.mp4",
					microphoneAudioPath: "D:\\REPOS\\trmms\\recording-1_mic.webm",
					webcamVideoPath: "D:\\REPOS\\trmms\\missing-webcam.webm",
				},
			},
			path.join(dir, "p.openscreen"),
		);
		expect(result.remapped).toEqual(["screenVideoPath", "microphoneAudioPath"]);
		expect(result.project.media.microphoneAudioPath).toBe(mic);
		expect(result.project.media.webcamVideoPath).toBe("D:\\REPOS\\trmms\\missing-webcam.webm");
	});

	it("resolves legacy videoPath projects", async () => {
		const screen = path.join(dir, "old.mp4");
		await fs.writeFile(screen, "x");
		const result = await resolvePortableMediaPaths(
			{ version: 1, editor: {}, videoPath: "/home/someone/old.mp4" },
			path.join(dir, "p.openscreen"),
		);
		expect(result.project.videoPath).toBe(screen);
	});

	it("never looks outside the project folder", () => {
		const projectFile = path.join(dir, "p.openscreen");
		expect(mediaPathCandidates(projectFile, undefined, "../secret.mp4")).toEqual([]);
		expect(mediaPathCandidates(projectFile, undefined, "media/../../secret.mp4")).toEqual([]);
		expect(mediaPathCandidates(projectFile, undefined, "C:/Windows/x.mp4")).toEqual([]);
		expect(mediaPathCandidates(projectFile, "/etc/../x.mp4", undefined)).toEqual([
			path.join(dir, "x.mp4"),
		]);
	});

	it("handles separators from either platform", () => {
		expect(crossPlatformBasename("D:\\a\\b\\c.mp4")).toBe("c.mp4");
		expect(crossPlatformBasename("/home/u/c.mp4")).toBe("c.mp4");
		expect(relativeMediaPath(path.join(dir, "p.openscreen"), path.join(dir, "a", "b.mp4"))).toBe(
			"a/b.mp4",
		);
	});
});
