import { expect, it } from "vitest";
import { shiftRegionsToSidecar } from "./sidecarTiming";

it("maps screen edits onto a delayed sidecar without losing boundary intersections", () => {
	expect(
		shiftRegionsToSidecar(
			[
				{ id: "before-camera", startMs: 0, endMs: 100 },
				{ id: "crosses-camera-start", startMs: 100, endMs: 300 },
				{ id: "later", startMs: 500, endMs: 700 },
			],
			200,
		),
	).toEqual([
		{ id: "crosses-camera-start", startMs: 0, endMs: 100 },
		{ id: "later", startMs: 300, endMs: 500 },
	]);
});
