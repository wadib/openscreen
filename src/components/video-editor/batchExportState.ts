import type { BatchExportUiEvent } from "../../../electron/batchExport";

export type BatchJobStatus = "queued" | "running" | "done" | "failed" | "skipped";

export interface BatchJob {
	project: string;
	output: string;
	status: BatchJobStatus;
	percentage: number;
	seconds?: number;
	error?: string;
}

export interface BatchState {
	phase: "idle" | "running" | "finished" | "cancelled";
	jobs: BatchJob[];
	summary?: { exported: number; total: number; seconds: number };
	error?: string;
}

export const INITIAL_BATCH_STATE: BatchState = { phase: "idle", jobs: [] };

/** Jobs as previewed before starting: exports to run, then outputs that will be skipped. */
export function previewJobs(
	jobs: Array<{ project: string; output: string }>,
	skipped: Array<{ project: string; output: string }>,
): BatchJob[] {
	return [
		...jobs.map((job) => ({ ...job, status: "queued" as const, percentage: 0 })),
		...skipped.map((job) => ({ ...job, status: "skipped" as const, percentage: 100 })),
	];
}

/** The runnable jobs come first, so the exporter's job index maps onto this list. */
export function reduceBatchEvent(state: BatchState, event: BatchExportUiEvent): BatchState {
	const update = (index: number, patch: Partial<BatchJob>): BatchJob[] =>
		state.jobs.map((job, position) => (position === index ? { ...job, ...patch } : job));
	switch (event.type) {
		case "start":
			return { ...state, phase: "running" };
		case "job":
			return {
				...state,
				jobs: state.jobs[event.index]
					? update(event.index, { status: "running", percentage: 0 })
					: [
							...state.jobs,
							{ project: event.project, output: event.output, status: "running", percentage: 0 },
						],
			};
		case "progress":
			return { ...state, jobs: update(event.index, { percentage: event.percentage }) };
		case "jobDone":
			return {
				...state,
				jobs: update(event.index, {
					status: event.success ? "done" : "failed",
					percentage: event.success ? 100 : (state.jobs[event.index]?.percentage ?? 0),
					seconds: event.seconds,
					error: event.error,
				}),
			};
		case "summary":
			return {
				...state,
				summary: { exported: event.exported, total: event.total, seconds: event.seconds },
			};
		case "error":
			return { ...state, error: event.message };
		case "diagnostic":
			return state;
		case "exit": {
			const cancelled = state.phase === "cancelled";
			return {
				...state,
				phase: cancelled ? "cancelled" : "finished",
				jobs: state.jobs.map((job) =>
					job.status === "running" || (cancelled && job.status === "queued")
						? { ...job, status: cancelled ? "queued" : "failed" }
						: job,
				),
				error:
					state.error ??
					(!cancelled && event.code !== 0 && !state.summary
						? `Export process stopped (code ${event.code ?? "?"})`
						: undefined),
			};
		}
	}
}

export function fileName(filePath: string): string {
	return filePath.split(/[\\/]/).pop() ?? filePath;
}
