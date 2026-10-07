export interface TimeRange {
	start: number;
	end: number;
}

/** Where the playhead lands after a page turn, as a share of the visible span. */
const PAGE_LEAD = 0.08;
/** Turn the page slightly before the playhead touches the right edge. */
const EDGE_MARGIN = 0.02;

export const FOLLOW_PLAYHEAD_STORAGE_KEY = "openscreen_timeline_follow_playhead";

/**
 * Page-style follow: while playing, when the playhead reaches the right edge (or is left of
 * the view), move the visible window so the playhead is near the left edge again. Returns
 * null when the playhead is already in view or the whole timeline is visible.
 */
export function followPlayheadRange(
	range: TimeRange,
	timeMs: number,
	totalMs: number,
): TimeRange | null {
	const span = range.end - range.start;
	if (span <= 0 || totalMs <= 0 || span >= totalMs) return null;
	const inView = timeMs >= range.start && timeMs <= range.end - span * EDGE_MARGIN;
	if (inView) return null;
	const start = Math.max(0, Math.min(totalMs - span, timeMs - span * PAGE_LEAD));
	if (Math.abs(start - range.start) < 1) return null;
	return { start, end: start + span };
}

export function loadFollowPlayhead(): boolean {
	try {
		return localStorage.getItem(FOLLOW_PLAYHEAD_STORAGE_KEY) !== "false";
	} catch {
		return true;
	}
}

export function saveFollowPlayhead(enabled: boolean): void {
	try {
		localStorage.setItem(FOLLOW_PLAYHEAD_STORAGE_KEY, String(enabled));
	} catch {
		/* storage unavailable: the choice lasts for this session */
	}
}
