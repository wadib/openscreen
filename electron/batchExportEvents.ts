/**
 * Progress events of a command-line / batch export. The CLI prints them as text for people,
 * or (with --progress-json) as marked JSON lines that the in-app Batch export reads.
 */

export type BatchExportEvent =
	| { type: "start"; total: number; skipped: string[] }
	| { type: "job"; index: number; total: number; project: string; output: string }
	| { type: "progress"; index: number; percentage: number }
	| { type: "diagnostic"; index: number; message: string }
	| { type: "jobDone"; index: number; success: boolean; seconds: number; error?: string }
	| { type: "summary"; exported: number; total: number; seconds: number }
	| { type: "error"; message: string };

export const BATCH_EVENT_PREFIX = "OPENSCREEN_EVENT ";

export function formatEventJson(event: BatchExportEvent): string {
	return `${BATCH_EVENT_PREFIX}${JSON.stringify(event)}`;
}

/** Parse one stdout line; null for anything that is not a batch event (e.g. Chromium logs). */
export function parseEventLine(line: string): BatchExportEvent | null {
	const start = line.indexOf(BATCH_EVENT_PREFIX);
	if (start < 0) return null;
	try {
		const value = JSON.parse(line.slice(start + BATCH_EVENT_PREFIX.length)) as BatchExportEvent;
		return value && typeof value === "object" && typeof value.type === "string" ? value : null;
	} catch {
		return null;
	}
}

/** The human-readable lines the CLI has always printed, or null for events it does not print. */
export function formatEventText(event: BatchExportEvent): string | null {
	switch (event.type) {
		case "start":
			return event.total === 0
				? [
						...event.skipped.map((file) => `skip ${file} (exists; use --overwrite)`),
						"Nothing to export.",
					].join("\n")
				: event.skipped.map((file) => `skip ${file} (exists; use --overwrite)`).join("\n") || null;
		case "job":
			return `[${event.index + 1}/${event.total}] ${event.project} -> ${event.output}`;
		case "progress":
			return `  ${Math.round(event.percentage)}%`;
		case "diagnostic":
			return `  ${event.message}`;
		case "jobDone":
			return event.success
				? `  done in ${event.seconds}s`
				: `  FAILED after ${event.seconds}s: ${event.error ?? "unknown error"}`;
		case "summary":
			return `${event.exported}/${event.total} exported in ${event.seconds}s`;
		case "error":
			return `openscreen: ${event.message}`;
	}
}
