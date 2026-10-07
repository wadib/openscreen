import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	CliUsageError,
	isCliExportInvocation,
	matchesProjectPattern,
	parseCliExportArgs,
	resolveCliExportJobs,
} from "./cliExport";

const cwd = path.resolve("/work");

describe("parseCliExportArgs", () => {
	it("ignores normal launches", () => {
		expect(parseCliExportArgs(["--studio-mcp"], cwd)).toBeNull();
		expect(isCliExportInvocation(["foo"])).toBe(false);
	});

	it("parses several jobs, quality and flags", () => {
		const request = parseCliExportArgs(
			[
				"--export",
				"a.openscreen",
				"out/a.mp4",
				"--quality",
				"source",
				"--export",
				"b.openscreen",
				"b.mp4",
				"--overwrite",
			],
			cwd,
		);
		expect(request).toMatchObject({
			jobs: [
				{ project: path.join(cwd, "a.openscreen"), output: path.join(cwd, "out", "a.mp4") },
				{ project: path.join(cwd, "b.openscreen"), output: path.join(cwd, "b.mp4") },
			],
			quality: "source",
			overwrite: true,
			show: false,
		});
	});

	it("rejects bad arguments", () => {
		expect(() => parseCliExportArgs(["--export", "a.openscreen"], cwd)).toThrow(CliUsageError);
		expect(() => parseCliExportArgs(["--export", "a.mp4", "b.mp4"], cwd)).toThrow(/openscreen/);
		expect(() => parseCliExportArgs(["--export", "a.openscreen", "b.mov"], cwd)).toThrow(/mp4/);
		expect(() =>
			parseCliExportArgs(["--export", "a.openscreen", "a.mp4", "--quality", "ultra"], cwd),
		).toThrow(/quality/);
	});
});

describe("resolveCliExportJobs", () => {
	it("expands folders in name order and skips finished outputs", async () => {
		const request = parseCliExportArgs(["--export-dir", "projects", "renders"], cwd)!;
		const existing = new Set([
			path.join(cwd, "projects", "p1_done.openscreen"),
			path.join(cwd, "projects", "p2_done.openscreen"),
			path.join(cwd, "renders", "p1_done.mp4"),
		]);
		const result = await resolveCliExportJobs(
			request,
			async (file) => existing.has(file),
			async () => ["p2_done.openscreen", "notes.txt", "p1_done.openscreen"],
		);
		expect(result.jobs).toEqual([
			{
				project: path.join(cwd, "projects", "p2_done.openscreen"),
				output: path.join(cwd, "renders", "p2_done.mp4"),
			},
		]);
		expect(result.skipped.map((job) => path.basename(job.output))).toEqual(["p1_done.mp4"]);
	});

	it("fails fast on a missing project", async () => {
		const request = parseCliExportArgs(["--export", "gone.openscreen", "gone.mp4"], cwd)!;
		await expect(resolveCliExportJobs(request, async () => false)).rejects.toThrow(/not found/);
	});
});

describe("project filters", () => {
	it("matches shell-style patterns with or without the extension", () => {
		expect(matchesProjectPattern("recording-1_p2_done.openscreen", "*_done")).toBe(true);
		expect(matchesProjectPattern("recording-1_p2_done.openscreen", "*_DONE.openscreen")).toBe(true);
		expect(matchesProjectPattern("recording-1_p2_clean.openscreen", "*_done")).toBe(false);
		expect(matchesProjectPattern("p3a_done.openscreen", "p3?_done")).toBe(true);
		expect(matchesProjectPattern("a.b(1)_done.openscreen", "a.b(1)*")).toBe(true);
		expect(matchesProjectPattern("axb_done.openscreen", "a.b*")).toBe(false);
	});

	it("applies --only and --exclude to --export-dir", async () => {
		const request = parseCliExportArgs(
			["--export-dir", "projects", "out", "--only", "*_done", "--exclude", "*p2_done"],
			cwd,
		)!;
		expect(request.only).toEqual(["*_done"]);
		expect(request.exclude).toEqual(["*p2_done"]);
		const result = await resolveCliExportJobs(
			request,
			async (file) => file.endsWith(".openscreen"),
			async () => [
				"r1_p2_done.openscreen",
				"r1_p2b_done.openscreen",
				"r2_p3a_clean.openscreen",
				"r2_p3a_done.openscreen",
			],
		);
		expect(result.jobs.map((job) => path.basename(job.project))).toEqual([
			"r1_p2b_done.openscreen",
			"r2_p3a_done.openscreen",
		]);
	});
});
