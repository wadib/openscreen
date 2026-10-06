import { describe, expect, it } from "vitest";
import { INITIAL_EDITOR_STATE } from "@/hooks/useEditorHistory";
import { studioEdit } from "./studioEdits";

describe("Studio MCP edits", () => {
	it("creates custom-area zooms with clamped focus without mutating the original", () => {
		const edit = studioEdit(
			INITIAL_EDITOR_STATE,
			"studio_set_zoom",
			{
				startMs: 100,
				endMs: 900,
				focus: { cx: 0, cy: 1 },
				area: { width: 0.6, height: 0.2, fit: "fit" },
			},
			1000,
		);
		expect(edit.patch.zoomRegions?.[0]).toMatchObject({
			area: { width: 0.6, height: 0.2, fit: "fit" },
			focus: { cx: 0.3, cy: 0.9 },
			focusMode: "manual",
		});
		expect(INITIAL_EDITOR_STATE.zoomRegions).toEqual([]);
	});
	it("rejects invalid intervals, unknown ids and overlap", () => {
		const args = { startMs: 100, endMs: 900, focus: { cx: 0.5, cy: 0.5 } };
		const edit = studioEdit(INITIAL_EDITOR_STATE, "studio_set_zoom", args, 1000);
		const state = { ...INITIAL_EDITOR_STATE, ...edit.patch };
		expect(() => studioEdit(state, "studio_set_zoom", args, 1000)).toThrow("overlaps");
		expect(() => studioEdit(state, "studio_set_zoom", { ...args, id: "missing" }, 1000)).toThrow(
			"does not exist",
		);
		expect(() =>
			studioEdit(state, "studio_add_trim", { startMs: 500, endMs: 400 }, 1000),
		).toThrow();
		expect(() =>
			studioEdit(state, "studio_add_speed", { startMs: 500, endMs: 1100, speed: 2 }, 1000),
		).toThrow();
	});
	it("replaces zooms, adds trims/speed, and removes specific regions", () => {
		const edit = studioEdit(
			INITIAL_EDITOR_STATE,
			"studio_set_zoom",
			{ startMs: 0, endMs: 500, focus: { cx: 0.5, cy: 0.5 }, scale: 2.35 },
			1000,
		);
		const state = { ...INITIAL_EDITOR_STATE, ...edit.patch };
		const updated = studioEdit(
			state,
			"studio_set_zoom",
			{ id: edit.id, startMs: 100, endMs: 600, depth: 2, focus: { cx: 0.4, cy: 0.4 } },
			1000,
		);
		expect(updated.patch.zoomRegions).toHaveLength(1);
		expect(updated.patch.zoomRegions?.[0].customScale).toBeUndefined();
		expect(
			studioEdit(state, "studio_remove_region", { kind: "zoom", id: edit.id }, 1000).patch
				.zoomRegions,
		).toEqual([]);
		expect(
			studioEdit(state, "studio_add_trim", { startMs: 300, endMs: 400 }, 1000).patch.trimRegions,
		).toHaveLength(1);
		expect(
			studioEdit(state, "studio_add_speed", { startMs: 400, endMs: 800, speed: 1.5 }, 1000).patch
				.speedRegions?.[0].speed,
		).toBe(1.5);
	});
	it("applies layout-only changes", () => {
		expect(
			studioEdit(
				INITIAL_EDITOR_STATE,
				"studio_set_layout",
				{ revision: 9, padding: 20, aspectRatio: "9:16" },
				1000,
			).patch,
		).toEqual({ padding: 20, aspectRatio: "9:16" });
	});
});
