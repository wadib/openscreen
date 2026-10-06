import { describe, expect, it } from "vitest";
import {
	checkWebmTimeline,
	findLastClusterTimecodeMs,
	WEBM_TIMELINE_TOLERANCE_MS,
} from "./webm-duration";

/** Minimal Cluster: ID, unknown size (as MediaRecorder writes), Timecode element. */
function cluster(timecodeMs: number): number[] {
	const value: number[] = [];
	let remaining = timecodeMs;
	do {
		value.unshift(remaining & 0xff);
		remaining = Math.floor(remaining / 256);
	} while (remaining > 0);
	return [
		0x1f,
		0x43,
		0xb6,
		0x75,
		0x01,
		0xff,
		0xff,
		0xff,
		0xff,
		0xff,
		0xff,
		0xff,
		0xe7,
		0x80 | value.length,
		...value,
		0xa3,
		0x81,
		0x00,
	];
}

function webm(...timecodes: number[]): Uint8Array {
	return new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x80, ...timecodes.flatMap(cluster)]);
}

describe("findLastClusterTimecodeMs", () => {
	it("returns the timecode of the last cluster", () => {
		expect(findLastClusterTimecodeMs(webm(0, 4_000, 395_744))).toBe(395_744);
	});

	it("returns null when there is no cluster", () => {
		expect(findLastClusterTimecodeMs(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x80]))).toBeNull();
	});
});

describe("checkWebmTimeline", () => {
	it("flags a sidecar that kept recording through a pause", () => {
		const check = checkWebmTimeline(webm(0, 390_000), 244_175);
		expect(check?.mismatch).toBe(true);
		expect(check?.overrunMs).toBe(390_000 - 244_175);
	});

	it("accepts a last cluster that starts shortly before the session end", () => {
		const check = checkWebmTimeline(webm(0, 240_000), 244_175);
		expect(check?.mismatch).toBe(false);
	});

	it("tolerates a final cluster within the tolerance past the declared end", () => {
		expect(checkWebmTimeline(webm(244_175 + WEBM_TIMELINE_TOLERANCE_MS), 244_175)?.mismatch).toBe(
			false,
		);
	});
});
