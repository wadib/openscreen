import { describe, expect, it } from "vitest";
import { followPlayheadRange } from "./followPlayhead";

describe("followPlayheadRange", () => {
	const range = { start: 10_000, end: 30_000 }; // 20 s visible of a 100 s video

	it("leaves the view alone while the playhead is visible", () => {
		expect(followPlayheadRange(range, 20_000, 100_000)).toBeNull();
		expect(followPlayheadRange(range, 10_000, 100_000)).toBeNull();
	});

	it("turns the page when the playhead reaches the right edge", () => {
		expect(followPlayheadRange(range, 29_800, 100_000)).toEqual({ start: 28_200, end: 48_200 });
	});

	it("brings the playhead back when it is left of the view", () => {
		expect(followPlayheadRange(range, 5_000, 100_000)).toEqual({ start: 3_400, end: 23_400 });
	});

	it("never runs past the end or before the start", () => {
		expect(followPlayheadRange(range, 99_000, 100_000)).toEqual({ start: 80_000, end: 100_000 });
		expect(followPlayheadRange({ start: 50_000, end: 70_000 }, 500, 100_000)).toEqual({
			start: 0,
			end: 20_000,
		});
	});

	it("does nothing when the whole timeline is visible", () => {
		expect(followPlayheadRange({ start: 0, end: 100_000 }, 99_000, 100_000)).toBeNull();
	});
});
