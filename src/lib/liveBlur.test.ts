import { describe, expect, it } from "vitest";
import { normalizeProjectEditor } from "../components/video-editor/projectPersistence";
import { DEFAULT_BLUR_DATA } from "../components/video-editor/types";
import {
	type BlurProjection,
	LiveBlurRecorder,
	normalizeLiveBlurAreas,
	normalizeRecordedBlurs,
	projectLiveBlur,
	recordedBlursToAnnotations,
	unprojectBlurPosition,
	unprojectBlurSize,
} from "./liveBlur";
import { normalizeRecordingSession } from "./recordingSession";

const area = {
	id: "a",
	position: { x: 30, y: 30 },
	size: { width: 20, height: 20 },
	blurData: { ...DEFAULT_BLUR_DATA, type: "blur" as const },
};
function fixture() {
	let time = 1000;
	const recorder = new LiveBlurRecorder(() => time);
	return {
		recorder,
		advance: (ms: number) => {
			time += ms;
		},
	};
}
describe("live blur recording", () => {
	it("preserves overlapping-area stacking when clips close in a different order", () => {
		const { recorder, advance } = fixture();
		recorder.update([area, { ...area, id: "b" }]);
		recorder.start(1);
		advance(100);
		recorder.update([area, { ...area, id: "b", blurData: { ...area.blurData, color: "black" } }]);
		advance(100);
		const clips = recorder.finish(1);
		expect(clips.map(({ id, zIndex }) => [id, zIndex])).toEqual([
			["b", 2],
			["a", 1],
			["b", 2],
		]);
		expect(recordedBlursToAnnotations(clips).map(({ zIndex }) => zIndex)).toEqual([2, 1, 2]);
	});
	it("uses native encoded timestamps instead of wall-clock duration under load", () => {
		const { recorder, advance } = fixture();
		recorder.update([area]);
		recorder.start(1);
		recorder.setMediaTime(0);
		advance(5000);
		recorder.setMediaTime(1000);
		recorder.pause();
		advance(5000);
		recorder.update([{ ...area, position: { x: 50, y: 30 } }]);
		recorder.resume();
		advance(4000);
		recorder.setMediaTime(2000);
		expect(recorder.finish(1).map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
			[0, 1000],
			[1000, 2000],
		]);
		recorder.start(2);
		advance(100);
		expect(recorder.finish(2)[0].endMs).toBe(100);
	});
	it("records preselected areas for the full recording without mutating source state", () => {
		const { recorder, advance } = fixture();
		recorder.update([area]);
		recorder.start(1);
		advance(1200);
		expect(recorder.finish(1)).toEqual([
			{ ...normalizeLiveBlurAreas([area])[0], startMs: 0, endMs: 1200, zIndex: 1 },
		]);
		expect(recorder.state.recording).toBe(false);
		expect(recorder.state.areas).toHaveLength(1);
	});
	it("records add, move, effect change and removal at their actual times", () => {
		const { recorder, advance } = fixture();
		recorder.start(1);
		advance(100);
		recorder.update([area]);
		advance(200);
		recorder.update([{ ...area, position: { x: 50, y: 30 } }]);
		advance(300);
		recorder.update([
			{ ...area, position: { x: 50, y: 30 }, blurData: { ...area.blurData, type: "mosaic" } },
		]);
		advance(400);
		recorder.update([]);
		advance(100);
		const clips = recorder.finish(1);
		expect(clips.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
			[100, 300],
			[300, 600],
			[600, 1000],
		]);
		expect(clips.map(({ blurData }) => blurData.type)).toEqual(["blur", "blur", "mosaic"]);
	});
	it("excludes pauses, including changes made while paused", () => {
		const { recorder, advance } = fixture();
		recorder.update([area]);
		recorder.start(1);
		advance(500);
		recorder.pause();
		recorder.pause();
		advance(5000);
		recorder.update([{ ...area, size: { width: 40, height: 20 } }]);
		advance(2000);
		recorder.resume();
		recorder.resume();
		advance(300);
		expect(recorder.finish(1).map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
			[0, 500],
			[500, 800],
		]);
	});
	it("supports stop while paused and repeated finalization for webcam attachment", () => {
		const { recorder, advance } = fixture();
		recorder.update([area]);
		recorder.start(1);
		advance(500);
		recorder.pause();
		advance(5000);
		const clips = recorder.finish(1);
		expect(clips[0].endMs).toBe(500);
		expect(recorder.finish(1)).toEqual(clips);
		clips[0].endMs = 99;
		expect(recorder.finish(1)[0].endMs).toBe(500);
	});
	it("does not split unchanged updates or retain previous-session clips", () => {
		const { recorder, advance } = fixture();
		recorder.update([area]);
		recorder.start(1);
		advance(500);
		recorder.update([area]);
		advance(500);
		expect(recorder.finish(1)).toHaveLength(1);
		recorder.start(2);
		advance(100);
		expect(recorder.finish(2)[0].endMs).toBe(100);
	});
	it("ignores wrong recording IDs and rejects a second active recording", () => {
		const { recorder, advance } = fixture();
		recorder.update([area]);
		recorder.start(1);
		recorder.start(1);
		advance(100);
		expect(recorder.finish(2)).toEqual([]);
		expect(() => recorder.start(2)).toThrow();
		expect(recorder.finish(1)).toHaveLength(1);
	});
	it("resets regions only when an idle source changes", () => {
		const { recorder } = fixture();
		recorder.selectSource("first");
		recorder.update([area]);
		recorder.selectSource("first");
		expect(recorder.state.areas).toHaveLength(1);
		recorder.start(1);
		recorder.selectSource("second");
		expect(recorder.state.sourceId).toBe("first");
		recorder.finish(1);
		recorder.selectSource("second");
		expect(recorder.state.areas).toEqual([]);
	});
	it("never creates zero-length clips", () => {
		const { recorder } = fixture();
		recorder.update([area]);
		recorder.start(1);
		recorder.update([]);
		expect(recorder.finish(1)).toEqual([]);
	});
	it("bounds malformed input, including fallback sizes at the source edge", () => {
		const [normalized] = normalizeLiveBlurAreas([
			{
				...area,
				position: { x: 999, y: 999 },
				size: {},
				blurData: { intensity: Infinity, blockSize: -1 },
			},
		]);
		expect(normalized.position).toEqual({ x: 99, y: 99 });
		expect(normalized.size).toEqual({ width: 1, height: 1 });
		expect(normalized.blurData.intensity).toBe(12);
		expect(normalizeLiveBlurAreas([area, area, { id: "" }])).toHaveLength(1);
		expect(
			normalizeRecordedBlurs([
				{ ...area, startMs: 0, endMs: 0 },
				{ ...area, startMs: NaN, endMs: 2 },
			]),
		).toEqual([]);
	});
	it("preserves Gaussian blur and source anchoring through session and project persistence", () => {
		const session = normalizeRecordingSession({
			screenVideoPath: "recording.mp4",
			createdAt: 1,
			recordedBlurs: [{ ...area, startMs: 100, endMs: 500 }],
		});
		const annotations = recordedBlursToAnnotations(session?.recordedBlurs ?? []);
		const editor = normalizeProjectEditor({ annotationRegions: annotations });
		expect(editor.annotationRegions[0]).toMatchObject({
			type: "blur",
			annotationSource: "live-blur",
			blurData: { type: "blur" },
			startMs: 100,
			endMs: 500,
		});
	});
});

describe("source-coordinate blur projection", () => {
	const view: BlurProjection = {
		width: 1000,
		height: 600,
		mask: { x: 100, y: 50, width: 800, height: 500 },
		crop: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
		scale: 1.2,
		x: -100,
		y: -40,
	};
	const annotation = recordedBlursToAnnotations([{ ...area, startMs: 0, endMs: 100 }])[0];
	it("round-trips position and size with crop, padding and zoom", () => {
		const projected = projectLiveBlur(annotation, view)!;
		const position = unprojectBlurPosition(projected.position, view);
		const size = unprojectBlurSize(projected.size, view);
		expect(position.x).toBeCloseTo(area.position.x);
		expect(position.y).toBeCloseTo(area.position.y);
		expect(size.width).toBeCloseTo(area.size.width);
		expect(size.height).toBeCloseTo(area.size.height);
	});
	it("clips without distorting an oval crossing the crop edge", () => {
		const projected = projectLiveBlur(
			{
				...annotation,
				position: { x: 10, y: 10 },
				blurData: { ...annotation.blurData!, shape: "oval" },
			},
			view,
		)!;
		expect(projected.position.x).toBeLessThan(0);
		expect(projected.blurClip?.x).toBe(20);
		expect(unprojectBlurPosition(projected.position, view).x).toBeCloseTo(10);
	});
	it("omits areas outside the visible source and leaves ordinary annotations unchanged", () => {
		expect(projectLiveBlur({ ...annotation, position: { x: 90, y: 90 } }, view)).toBeNull();
		expect(projectLiveBlur({ ...annotation, annotationSource: undefined }, view)?.position).toEqual(
			area.position,
		);
		expect(projectLiveBlur(annotation, { ...view, width: 0 })).toBeNull();
	});
});
