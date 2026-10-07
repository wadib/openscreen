import { describe, expect, it } from "vitest";
import { crossfadeFrameCount, isCutBetween, outgoingOpacity } from "./cutCrossfade";

const trims = [
	{ id: "a", startMs: 1000, endMs: 2000 },
	{ id: "b", startMs: 5000, endMs: 5000 },
];

describe("isCutBetween", () => {
	it("detects the jump over a trim", () => {
		expect(isCutBetween(trims, 983, 2000)).toBe(true);
		expect(isCutBetween(trims, 999.5, 2010)).toBe(true);
	});

	it("ignores ordinary frame steps, fast speed regions and empty trims", () => {
		expect(isCutBetween(trims, 100, 116.7)).toBe(false);
		expect(isCutBetween(trims, 2000, 2266)).toBe(false);
		expect(isCutBetween(trims, 4990, 5010)).toBe(false);
	});
});

it("sizes and shapes the dissolve", () => {
	expect(crossfadeFrameCount(250, 60)).toBe(15);
	expect(crossfadeFrameCount(0, 60)).toBe(0);
	expect(outgoingOpacity(1, 3)).toBeCloseTo(0.75);
	expect(outgoingOpacity(3, 3)).toBeCloseTo(0.25);
});
