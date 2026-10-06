import { describe, expect, it } from "vitest";
import { normalizeProjectEditor } from "../projectPersistence";
import { getZoomScale, normalizeZoomArea, type ZoomRegion } from "../types";
import { clampZoomAreaFocus, getZoomAreaMask } from "./zoomArea";
import { findDominantRegion } from "./zoomRegionUtils";

const region: ZoomRegion = {
	id: "zoom-1",
	startMs: 0,
	endMs: 3000,
	depth: 3,
	focus: { cx: 0.5, cy: 0.5 },
	customScale: 1.73,
};
const stage = { width: 640, height: 360 };
const base = { x: 0, y: 0, ...stage };

describe("custom zoom areas", () => {
	it("fits or fills a non-proportional rectangle using uniform magnification", () => {
		expect(getZoomScale({ ...region, area: { width: 0.6, height: 0.2, fit: "fit" } })).toBeCloseTo(
			1 / 0.6,
		);
		expect(getZoomScale({ ...region, area: { width: 0.6, height: 0.2, fit: "fill" } })).toBe(5);
		expect(getZoomScale(region)).toBe(1.73);
	});
	it("clamps focus independently for width and height", () => {
		expect(
			clampZoomAreaFocus(
				{ ...region, area: { width: 0.8, height: 0.2, fit: "fit" } },
				{ cx: 0, cy: 1 },
			),
		).toEqual({ cx: 0.4, cy: 0.9 });
	});
	it("clips to the selected area and animates back to the original mask", () => {
		const custom = { ...region, area: { width: 0.6, height: 0.2, fit: "fit" as const } };
		expect(getZoomAreaMask(custom, stage, base, 1)).toEqual({
			x: 128,
			y: 144,
			width: 384,
			height: 72,
		});
		expect(getZoomAreaMask(custom, stage, base, 0.5)).toEqual({
			x: 64,
			y: 72,
			width: 512,
			height: 216,
		});
		expect(getZoomAreaMask(custom, stage, base, 0)).toEqual(base);
		expect(getZoomAreaMask(region, stage, base, 1)).toEqual(base);
	});
	it("does not expose pixels beyond a padded or cropped source mask", () => {
		const padded = { x: 100, y: 80, width: 440, height: 200 };
		const custom = { ...region, area: { width: 1, height: 1, fit: "fit" as const } };
		expect(getZoomAreaMask(custom, stage, padded, 1)).toEqual(padded);
	});
	it("normalizes unsafe dimensions and keeps old projects compatible", () => {
		expect(normalizeZoomArea({ width: 0, height: 3, fit: "invalid" })).toEqual({
			width: 0.05,
			height: 1,
			fit: "fit",
		});
		expect(normalizeZoomArea({ width: NaN, height: 0.3 })).toBeUndefined();
		expect(normalizeZoomArea({ width: "0.3", height: 0.3 })).toBeUndefined();
		expect(normalizeProjectEditor({ zoomRegions: [region] }).zoomRegions[0].customScale).toBe(1.73);
	});
	it("round-trips independent dimensions and framing in project files", () => {
		const custom = { ...region, area: { width: 0.61, height: 0.23, fit: "fill" as const } };
		const editor = normalizeProjectEditor(JSON.parse(JSON.stringify({ zoomRegions: [custom] })));
		expect(editor.zoomRegions[0]).toMatchObject(custom);
	});
	it("interpolates differently shaped adjacent zooms without snapping the mask", () => {
		const wide = { ...region, endMs: 2000, area: { width: 0.6, height: 0.2, fit: "fit" as const } };
		const tall = {
			...region,
			id: "zoom-2",
			startMs: 3000,
			endMs: 5000,
			area: { width: 0.2, height: 0.6, fit: "fit" as const },
		};
		const result = findDominantRegion([wide, tall], 2400, { connectZooms: true });
		expect(result.transition).not.toBeNull();
		expect(result.region?.area?.width).toBeLessThan(0.6);
		expect(result.region?.area?.width).toBeGreaterThan(0.2);
		expect(result.region?.area?.height).toBeGreaterThan(0.2);
	});
});
