import { describe, expect, it } from "vitest";
import type { CursorTelemetryPoint } from "../types";
import {
	buildAutoZoomSuggestions,
	MAX_ZOOMED_SHARE,
	MIN_GAP_BETWEEN_ZOOMS_MS,
	ZOOM_LEAD_IN_MS,
	ZOOM_TAIL_MS,
} from "./zoomSuggestionUtils";

/**
 * Cursor path: hold at each point for its duration, moving instantly between holds, then
 * keep the cursor moving for `tailMs` so the recording is realistically long.
 */
function path(holds: { cx: number; cy: number; ms: number }[], tailMs = 60_000, stepMs = 100) {
	const samples: CursorTelemetryPoint[] = [];
	let time = 0;
	for (const hold of holds) {
		for (let t = 0; t <= hold.ms; t += stepMs)
			samples.push({ timeMs: time + t, cx: hold.cx, cy: hold.cy });
		time += hold.ms + stepMs;
	}
	for (let t = 0; t < tailMs; t += stepMs)
		samples.push({ timeMs: time + t, cx: t % 200 ? 0.3 : 0.7, cy: 0.5 });
	return { samples, totalMs: time + tailMs };
}

describe("buildAutoZoomSuggestions", () => {
	it("spans the whole hold instead of a fixed share of the recording", () => {
		const { samples, totalMs } = path([
			{ cx: 0.2, cy: 0.2, ms: 3000 },
			{ cx: 0.6, cy: 0.5, ms: 12_000 },
			{ cx: 0.2, cy: 0.8, ms: 3000 },
		]);
		const [zoom] = buildAutoZoomSuggestions({
			cursorTelemetry: samples,
			totalMs,
			existingRegions: [],
		});
		expect(zoom.focus.cx).toBeCloseTo(0.6);
		expect(zoom.focus.cy).toBeCloseTo(0.5);
		expect(zoom.span.start).toBe(3100 - ZOOM_LEAD_IN_MS);
		expect(zoom.span.end).toBe(3100 + 12_000 + ZOOM_TAIL_MS);
	});

	it("keeps long holds that the old 2.6 s cap discarded", () => {
		const { samples, totalMs } = path([
			{ cx: 0.1, cy: 0.1, ms: 1000 },
			{ cx: 0.5, cy: 0.5, ms: 20_000 },
			{ cx: 0.9, cy: 0.1, ms: 1000 },
		]);
		const zooms = buildAutoZoomSuggestions({
			cursorTelemetry: samples,
			totalMs,
			existingRegions: [],
		});
		expect(zooms).toHaveLength(1);
		expect(zooms[0].span.end - zooms[0].span.start).toBeGreaterThan(19_000);
	});

	it("ignores a cursor parked from the start and holds at the frame edge", () => {
		const parked = path([{ cx: 0.5, cy: 0.5, ms: 30_000 }], 0);
		expect(
			buildAutoZoomSuggestions({
				cursorTelemetry: parked.samples,
				totalMs: parked.totalMs,
				existingRegions: [],
			}),
		).toEqual([]);
		const edge = path([
			{ cx: 0.5, cy: 0.5, ms: 1000 },
			{ cx: 0.99, cy: 0.5, ms: 8000 },
		]);
		expect(
			buildAutoZoomSuggestions({
				cursorTelemetry: edge.samples,
				totalMs: edge.totalMs,
				existingRegions: [],
			}),
		).toEqual([]);
	});

	it("counts a short hold when the user clicks during it", () => {
		// Brief stops in between keep the clicked hold well clear of the later long hold.
		const shuffle = Array.from({ length: 16 }, (_, i) => ({
			cx: i % 2 ? 0.3 : 0.5,
			cy: 0.6,
			ms: 300,
		}));
		const { samples, totalMs } = path([
			{ cx: 0.2, cy: 0.2, ms: 2000 },
			{ cx: 0.7, cy: 0.4, ms: 1000 },
			...shuffle,
			{ cx: 0.2, cy: 0.8, ms: 3000 },
		]);
		const clickedHold = (zooms: { focus: { cx: number } }[]) =>
			zooms.some((zoom) => Math.abs(zoom.focus.cx - 0.7) < 1e-9);
		const without = buildAutoZoomSuggestions({
			cursorTelemetry: samples,
			totalMs,
			existingRegions: [],
		});
		const withClick = buildAutoZoomSuggestions({
			cursorTelemetry: samples,
			totalMs,
			existingRegions: [],
			clickTimestampsMs: [2600],
		});
		expect(clickedHold(without)).toBe(false);
		expect(clickedHold(withClick)).toBe(true);
	});

	it("never places a zoom inside a trimmed section", () => {
		const { samples, totalMs } = path([
			{ cx: 0.2, cy: 0.2, ms: 2000 },
			{ cx: 0.6, cy: 0.5, ms: 10_000 },
			{ cx: 0.2, cy: 0.8, ms: 2000 },
		]);
		const trimmed = buildAutoZoomSuggestions({
			cursorTelemetry: samples,
			totalMs,
			existingRegions: [],
			trimRegions: [{ start: 0, end: totalMs }],
		});
		expect(trimmed).toEqual([]);
		const partly = buildAutoZoomSuggestions({
			cursorTelemetry: samples,
			totalMs,
			existingRegions: [],
			trimRegions: [{ start: 2100, end: 7000 }],
		});
		expect(partly).toHaveLength(1);
		expect(partly[0].span.start).toBeGreaterThanOrEqual(7000);
	});

	it("shortens an over-budget hold instead of dropping it", () => {
		const { samples, totalMs } = path(
			[
				{ cx: 0.2, cy: 0.2, ms: 1000 },
				{ cx: 0.6, cy: 0.5, ms: 20_000 },
			],
			10_000,
		);
		const zooms = buildAutoZoomSuggestions({
			cursorTelemetry: samples,
			totalMs,
			existingRegions: [],
		});
		expect(zooms).toHaveLength(1);
		expect(zooms[0].span.end - zooms[0].span.start).toBeLessThanOrEqual(totalMs * MAX_ZOOMED_SHARE);
	});

	it("keeps a gap to existing zooms and caps the zoomed share of the timeline", () => {
		const holds = Array.from({ length: 12 }, (_, i) => [
			{ cx: 0.2 + (i % 3) * 0.25, cy: 0.3 + (i % 2) * 0.3, ms: 6000 },
			{ cx: 0.5, cy: 0.9, ms: 500 },
		]).flat();
		const { samples, totalMs } = path(holds);
		const existing = [{ start: 0, end: 4000 }];
		const zooms = buildAutoZoomSuggestions({
			cursorTelemetry: samples,
			totalMs,
			existingRegions: existing,
		});
		const zoomed = zooms.reduce((sum, zoom) => sum + zoom.span.end - zoom.span.start, 0);
		expect(zoomed).toBeLessThanOrEqual(totalMs * MAX_ZOOMED_SHARE);
		for (const zoom of zooms)
			expect(zoom.span.start).toBeGreaterThanOrEqual(4000 + MIN_GAP_BETWEEN_ZOOMS_MS);
		for (let i = 1; i < zooms.length; i++)
			expect(zooms[i].span.start - zooms[i - 1].span.end).toBeGreaterThanOrEqual(
				MIN_GAP_BETWEEN_ZOOMS_MS,
			);
	});
});
