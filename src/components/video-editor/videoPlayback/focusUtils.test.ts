import { describe, expect, it } from "vitest";
import { clampFocusInsideMask, stageFocusToVideoSpace, videoFocusToStageSpace } from "./focusUtils";

// 1920x1080 stage, recording scaled into the central 80% (padding 50) -> 10% border.
const stage = { width: 1920, height: 1080 };
const video = { width: 1920, height: 1080 };
const baseScale = 0.8;
const baseOffset = { x: 192, y: 108 };
const mask = { x: 192, y: 108, width: 1536, height: 864 };

describe("videoFocusToStageSpace", () => {
	it("maps recording coordinates into the padded stage", () => {
		expect(videoFocusToStageSpace({ cx: 0, cy: 0 }, stage, video, baseScale, baseOffset)).toEqual({
			cx: 0.1,
			cy: 0.1,
		});
		const centre = videoFocusToStageSpace(
			{ cx: 0.5, cy: 0.5 },
			stage,
			video,
			baseScale,
			baseOffset,
		);
		expect(centre.cx).toBeCloseTo(0.5);
		expect(centre.cy).toBeCloseTo(0.5);
	});

	it("is the inverse of stageFocusToVideoSpace", () => {
		const point = { cx: 0.27, cy: 0.83 };
		const back = stageFocusToVideoSpace(
			videoFocusToStageSpace(point, stage, video, baseScale, baseOffset),
			stage,
			video,
			baseScale,
			baseOffset,
		);
		expect(back.cx).toBeCloseTo(point.cx);
		expect(back.cy).toBeCloseTo(point.cy);
	});
});

describe("clampFocusInsideMask", () => {
	it("pulls a near-edge zoom inward so its view stays on the recording", () => {
		const focus = clampFocusInsideMask({ cx: 0.11, cy: 0.88 }, 2.25, stage, mask);
		const half = 0.5 / 2.25;
		expect(focus.cx - half).toBeCloseTo(0.1);
		expect(focus.cy + half).toBeCloseTo(0.9);
	});

	it("leaves a zoom that already fits untouched", () => {
		expect(clampFocusInsideMask({ cx: 0.5, cy: 0.45 }, 2.25, stage, mask)).toEqual({
			cx: 0.5,
			cy: 0.45,
		});
	});

	it("centres on the recording when the view is wider than it", () => {
		const focus = clampFocusInsideMask({ cx: 0.2, cy: 0.2 }, 1.1, stage, mask);
		expect(focus.cx).toBeCloseTo(0.5);
		expect(focus.cy).toBeCloseTo(0.5);
	});
});
