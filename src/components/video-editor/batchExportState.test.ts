import { describe, expect, it } from "vitest";
import {
	type BatchState,
	fileName,
	INITIAL_BATCH_STATE,
	previewJobs,
	reduceBatchEvent,
} from "./batchExportState";

const start = (): BatchState => ({
	...INITIAL_BATCH_STATE,
	jobs: previewJobs(
		[
			{ project: "/p/a_done.openscreen", output: "/o/a_done.mp4" },
			{ project: "/p/b_done.openscreen", output: "/o/b_done.mp4" },
		],
		[{ project: "/p/c_done.openscreen", output: "/o/c_done.mp4" }],
	),
});

describe("reduceBatchEvent", () => {
	it("tracks each project from queued to done or failed", () => {
		let state = start();
		state = reduceBatchEvent(state, { type: "start", total: 2, skipped: ["/o/c_done.mp4"] });
		expect(state.phase).toBe("running");
		state = reduceBatchEvent(state, {
			type: "job",
			index: 0,
			total: 2,
			project: "/p/a_done.openscreen",
			output: "/o/a_done.mp4",
		});
		state = reduceBatchEvent(state, { type: "progress", index: 0, percentage: 40 });
		expect(state.jobs[0]).toMatchObject({ status: "running", percentage: 40 });
		state = reduceBatchEvent(state, { type: "jobDone", index: 0, success: true, seconds: 30 });
		state = reduceBatchEvent(state, {
			type: "job",
			index: 1,
			total: 2,
			project: "/p/b_done.openscreen",
			output: "/o/b_done.mp4",
		});
		state = reduceBatchEvent(state, {
			type: "jobDone",
			index: 1,
			success: false,
			seconds: 5,
			error: "missing media",
		});
		state = reduceBatchEvent(state, { type: "summary", exported: 1, total: 2, seconds: 35 });
		state = reduceBatchEvent(state, { type: "exit", code: 1 });
		expect(state.phase).toBe("finished");
		expect(state.jobs.map((job) => job.status)).toEqual(["done", "failed", "skipped"]);
		expect(state.jobs[1].error).toBe("missing media");
		expect(state.summary).toEqual({ exported: 1, total: 2, seconds: 35 });
		expect(state.error).toBeUndefined();
	});

	it("returns unfinished projects to the queue when cancelled", () => {
		let state = { ...start(), phase: "cancelled" as const };
		state.jobs[0].status = "running";
		state = reduceBatchEvent(state, { type: "exit", code: null });
		expect(state.phase).toBe("cancelled");
		expect(state.jobs.map((job) => job.status)).toEqual(["queued", "queued", "skipped"]);
	});

	it("reports a process that stopped without a summary", () => {
		const state = reduceBatchEvent({ ...start(), phase: "running" }, { type: "exit", code: 3 });
		expect(state.error).toMatch(/code 3/);
	});
});

it("takes file names from Windows and Linux paths", () => {
	expect(fileName("C:\\a\\b.mp4")).toBe("b.mp4");
	expect(fileName("/a/b.mp4")).toBe("b.mp4");
});
