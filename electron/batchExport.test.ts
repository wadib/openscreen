import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: { getAppPath: () => "/app" },
	BrowserWindow: { fromWebContents: () => null },
	dialog: {},
	ipcMain: { handle: vi.fn() },
}));

import { buildBatchExportArgs, splitPatterns } from "./batchExport";
import { formatEventJson, formatEventText, parseEventLine } from "./batchExportEvents";

const options = {
	folder: "/home/sam/Videos/Openscreen",
	outputDir: "/home/sam/Videos/Openscreen/exports",
	only: "*_done",
	exclude: "*p2_done, *p9",
	quality: "good" as const,
	overwrite: true,
};

describe("buildBatchExportArgs", () => {
	it("builds the export-dir command with filters, quality and machine-readable progress", () => {
		expect(
			buildBatchExportArgs(options, {
				defaultApp: false,
				appPath: "/app",
				platform: "win32",
				userDataDir: "/tmp/batch",
			}),
		).toEqual([
			"--export-dir",
			"/home/sam/Videos/Openscreen",
			"/home/sam/Videos/Openscreen/exports",
			"--only",
			"*_done",
			"--exclude",
			"*p2_done",
			"--exclude",
			"*p9",
			"--quality",
			"good",
			"--overwrite",
			"--progress-json",
			"--user-data-dir=/tmp/batch",
		]);
	});

	it("passes the app folder in development", () => {
		const args = buildBatchExportArgs(
			{ ...options, only: "", exclude: "", overwrite: false },
			{ defaultApp: true, appPath: "/repo", platform: "win32", userDataDir: "/tmp/b" },
		);
		expect(args[0]).toBe("/repo");
		expect(args).not.toContain("--only");
		expect(args).not.toContain("--overwrite");
	});
});

it("splits patterns on commas and spaces", () => {
	expect(splitPatterns(" *_done, *_final  *_x ")).toEqual(["*_done", "*_final", "*_x"]);
	expect(splitPatterns("")).toEqual([]);
});

describe("batch export events", () => {
	it("round-trips JSON lines and ignores other output", () => {
		const event = { type: "progress" as const, index: 2, percentage: 41.5 };
		expect(parseEventLine(formatEventJson(event))).toEqual(event);
		expect(parseEventLine("[OpenH264] Warning: something")).toBeNull();
		expect(parseEventLine("OPENSCREEN_EVENT {broken")).toBeNull();
	});

	it("keeps the human-readable CLI output", () => {
		expect(
			formatEventText({
				type: "job",
				index: 0,
				total: 3,
				project: "a.openscreen",
				output: "a.mp4",
			}),
		).toBe("[1/3] a.openscreen -> a.mp4");
		expect(formatEventText({ type: "jobDone", index: 0, success: true, seconds: 25 })).toBe(
			"  done in 25s",
		);
		expect(formatEventText({ type: "start", total: 0, skipped: ["x.mp4"] })).toBe(
			"skip x.mp4 (exists; use --overwrite)\nNothing to export.",
		);
		expect(formatEventText({ type: "summary", exported: 2, total: 3, seconds: 90 })).toBe(
			"2/3 exported in 90s",
		);
	});
});
