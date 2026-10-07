import type { CursorTelemetryPoint, ZoomFocus } from "../types";

/** A hold shorter than this is a pass-through, not something being pointed at. */
export const MIN_DWELL_DURATION_MS = 2000;
/** A shorter hold still counts when the user clicks during it. */
export const MIN_CLICKED_DWELL_DURATION_MS = 800;
/** Movement between consecutive samples above this ends a hold (normalized units). */
export const DWELL_MOVE_THRESHOLD = 0.02;
/** The cursor must have travelled this far just before a hold, unless it clicked. */
export const ARRIVAL_DISTANCE = 0.1;
export const ARRIVAL_WINDOW_MS = 2600;
/** Holds this close to the frame edge are a resting cursor or a scrollbar. */
export const EDGE_MARGIN = 0.04;
export const ZOOM_LEAD_IN_MS = 600;
export const ZOOM_TAIL_MS = 300;
export const MIN_ZOOM_DURATION_MS = 2500;
export const MAX_ZOOM_DURATION_MS = 25_000;
/** Leave room for one zoom to ease out before the next eases in. */
export const MIN_GAP_BETWEEN_ZOOMS_MS = 1000;
/** Never zoom more than this share of the kept timeline. */
export const MAX_ZOOMED_SHARE = 0.4;

export interface ZoomDwellCandidate {
	startMs: number;
	endMs: number;
	centerTimeMs: number;
	focus: ZoomFocus;
	clicked: boolean;
	strength: number;
}

function normalizeTelemetrySample(
	sample: CursorTelemetryPoint,
	totalMs: number,
): CursorTelemetryPoint {
	return {
		timeMs: Math.max(0, Math.min(sample.timeMs, totalMs)),
		cx: Math.max(0, Math.min(sample.cx, 1)),
		cy: Math.max(0, Math.min(sample.cy, 1)),
	};
}

export function normalizeCursorTelemetry(
	telemetry: CursorTelemetryPoint[],
	totalMs: number,
): CursorTelemetryPoint[] {
	return [...telemetry]
		.filter(
			(sample) =>
				Number.isFinite(sample.timeMs) && Number.isFinite(sample.cx) && Number.isFinite(sample.cy),
		)
		.sort((a, b) => a.timeMs - b.timeMs)
		.map((sample) => normalizeTelemetrySample(sample, totalMs));
}

/**
 * Find moments where the cursor deliberately points at something: it arrives (or clicks)
 * and then holds still. Long holds are kept — those are usually the thing being explained.
 */
export function detectZoomDwellCandidates(
	samples: CursorTelemetryPoint[],
	clickTimestampsMs: number[] = [],
): ZoomDwellCandidate[] {
	if (samples.length < 2) return [];
	const clicks = [...clickTimestampsMs].sort((a, b) => a - b);
	const hasClickBetween = (start: number, end: number) =>
		clicks.some((time) => time >= start && time <= end);
	const candidates: ZoomDwellCandidate[] = [];

	const pushRunIfDwell = (startIndex: number, endIndexExclusive: number) => {
		if (endIndexExclusive - startIndex < 2) return;
		const start = samples[startIndex];
		const end = samples[endIndexExclusive - 1];
		const duration = end.timeMs - start.timeMs;
		const clicked = hasClickBetween(start.timeMs - 300, end.timeMs);
		if (duration < (clicked ? MIN_CLICKED_DWELL_DURATION_MS : MIN_DWELL_DURATION_MS)) return;

		const run = samples.slice(startIndex, endIndexExclusive);
		const cx = run.reduce((sum, sample) => sum + sample.cx, 0) / run.length;
		const cy = run.reduce((sum, sample) => sum + sample.cy, 0) / run.length;
		if (cx < EDGE_MARGIN || cx > 1 - EDGE_MARGIN || cy > 1 - EDGE_MARGIN) return;

		// A cursor parked since the start, or left resting, is not pointing at anything.
		let travel = 0;
		for (let index = startIndex - 1; index >= 0; index--) {
			const sample = samples[index];
			if (start.timeMs - sample.timeMs > ARRIVAL_WINDOW_MS) break;
			travel = Math.max(travel, Math.hypot(sample.cx - cx, sample.cy - cy));
		}
		if (travel < ARRIVAL_DISTANCE && !clicked) return;

		candidates.push({
			startMs: start.timeMs,
			endMs: end.timeMs,
			centerTimeMs: Math.round((start.timeMs + end.timeMs) / 2),
			focus: { cx, cy },
			clicked,
			strength: duration * (clicked ? 2 : 1),
		});
	};

	let runStart = 0;
	for (let index = 1; index < samples.length; index++) {
		const prev = samples[index - 1];
		const curr = samples[index];
		if (Math.hypot(curr.cx - prev.cx, curr.cy - prev.cy) > DWELL_MOVE_THRESHOLD) {
			pushRunIfDwell(runStart, index);
			runStart = index;
		}
	}
	pushRunIfDwell(runStart, samples.length);
	return candidates;
}

export interface AutoZoomSuggestion {
	span: { start: number; end: number };
	focus: ZoomFocus;
}

interface Span {
	start: number;
	end: number;
}

function keptParts(span: Span, trims: Span[]): Span[] {
	let parts: Span[] = [span];
	for (const trim of trims) {
		parts = parts.flatMap((part) => {
			if (trim.end <= part.start || trim.start >= part.end) return [part];
			const pieces: Span[] = [];
			if (trim.start > part.start) pieces.push({ start: part.start, end: trim.start });
			if (trim.end < part.end) pieces.push({ start: trim.end, end: part.end });
			return pieces;
		});
	}
	return parts;
}

/**
 * Build non-overlapping zoom suggestions from cursor telemetry. Each zoom spans the hold it
 * comes from (plus a short lead-in), never lands in a trimmed section, keeps a gap to other
 * zooms, and the total stays under MAX_ZOOMED_SHARE of the kept timeline — strongest holds
 * (longest, clicked) win. Focus is in recording coordinates; the caller maps it to the stage.
 * Pure, shared by the magic-wand toggle and the on-load auto-suggest pass.
 */
export function buildAutoZoomSuggestions(options: {
	cursorTelemetry: CursorTelemetryPoint[];
	totalMs: number;
	existingRegions: Span[];
	trimRegions?: Span[];
	clickTimestampsMs?: number[];
}): AutoZoomSuggestion[] {
	const {
		cursorTelemetry,
		totalMs,
		existingRegions,
		trimRegions = [],
		clickTimestampsMs,
	} = options;
	if (totalMs <= 0 || cursorTelemetry.length < 2) return [];
	const samples = normalizeCursorTelemetry(cursorTelemetry, totalMs);
	const candidates = detectZoomDwellCandidates(samples, clickTimestampsMs);
	if (candidates.length === 0) return [];

	const trims = trimRegions
		.map((trim) => ({ start: trim.start, end: trim.end }))
		.sort((a, b) => a.start - b.start);
	const keptMs = keptParts({ start: 0, end: totalMs }, trims).reduce(
		(sum, part) => sum + part.end - part.start,
		0,
	);
	let budgetMs = keptMs * MAX_ZOOMED_SHARE;
	const reserved: Span[] = existingRegions.map((region) => ({
		start: region.start,
		end: region.end,
	}));
	const suggestions: AutoZoomSuggestion[] = [];

	for (const candidate of [...candidates].sort((a, b) => b.strength - a.strength)) {
		let start = Math.max(0, candidate.startMs - ZOOM_LEAD_IN_MS);
		let end = Math.min(totalMs, candidate.endMs + ZOOM_TAIL_MS);
		if (end - start < MIN_ZOOM_DURATION_MS) {
			const pad = (MIN_ZOOM_DURATION_MS - (end - start)) / 2;
			start = Math.max(0, start - pad);
			end = Math.min(totalMs, start + MIN_ZOOM_DURATION_MS);
		}
		end = Math.min(end, start + MAX_ZOOM_DURATION_MS);

		// Only the longest untrimmed piece, and only if it is still long enough to read.
		const piece = keptParts({ start, end }, trims).sort(
			(a, b) => b.end - b.start - (a.end - a.start),
		)[0];
		if (!piece || piece.end - piece.start < MIN_ZOOM_DURATION_MS) continue;
		// Over budget: shorten rather than drop, so the strongest hold still gets its zoom.
		if (piece.end - piece.start > budgetMs) piece.end = piece.start + budgetMs;
		if (piece.end - piece.start < MIN_ZOOM_DURATION_MS) continue;
		const span = { start: Math.round(piece.start), end: Math.round(piece.end) };

		const clashes = reserved.some(
			(other) =>
				span.end + MIN_GAP_BETWEEN_ZOOMS_MS > other.start &&
				span.start - MIN_GAP_BETWEEN_ZOOMS_MS < other.end,
		);
		if (clashes) continue;

		budgetMs -= span.end - span.start;
		reserved.push(span);
		suggestions.push({ span, focus: candidate.focus });
	}
	return suggestions.sort((a, b) => a.span.start - b.span.start);
}
