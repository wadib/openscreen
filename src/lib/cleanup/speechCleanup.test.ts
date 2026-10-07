import { describe, expect, it } from "vitest";
import {
	buildCleanupTrims,
	detectFillers,
	detectPauses,
	encodeWav16,
	isFillerWord,
	shiftSpans,
} from "./speechCleanup";

const RATE = 16_000;

/** Speech-like noise bursts separated by near-silence, with a little background noise. */
function signal(parts: Array<{ ms: number; speech: boolean }>): Float32Array {
	const total = parts.reduce((sum, part) => sum + part.ms, 0);
	const out = new Float32Array((total * RATE) / 1000);
	let seed = 1;
	const random = () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647 - 0.5;
	};
	let offset = 0;
	for (const part of parts) {
		const length = (part.ms * RATE) / 1000;
		for (let index = 0; index < length; index++) {
			out[offset + index] = part.speech
				? 0.3 * Math.sin((2 * Math.PI * 180 * index) / RATE) + 0.1 * random()
				: 0.002 * random();
		}
		offset += length;
	}
	return out;
}

describe("detectPauses", () => {
	it("shortens long silences and keeps short ones", () => {
		const samples = signal([
			{ ms: 2000, speech: true },
			{ ms: 300, speech: false },
			{ ms: 2000, speech: true },
			{ ms: 2000, speech: false },
			{ ms: 2000, speech: true },
		]);
		const pauses = detectPauses(samples, RATE, { minPauseMs: 800, keepMs: 150 });
		expect(pauses).toHaveLength(1);
		expect(pauses[0].startMs).toBeCloseTo(4300 + 150, -2);
		expect(pauses[0].endMs).toBeCloseTo(6300 - 150, -2);
	});

	it("adapts to a noisy floor", () => {
		const samples = signal([
			{ ms: 1500, speech: true },
			{ ms: 1500, speech: false },
			{ ms: 1500, speech: true },
		]).map((value, index) => value + 0.02 * Math.sin(index / 3));
		expect(detectPauses(samples, RATE)).toHaveLength(1);
	});
});

describe("filler words", () => {
	it("recognises fillers in Whisper and CrisperWhisper forms", () => {
		for (const word of ["um", " Uh,", "[UM]", "[UH]", "erm...", "Em", "hmm"]) {
			expect(isFillerWord(word)).toBe(true);
		}
		for (const word of ["umbrella", "the", "hello", "emit"]) {
			expect(isFillerWord(word)).toBe(false);
		}
	});

	it("pads fillers without cutting into neighbouring words", () => {
		const spans = detectFillers([
			{ text: "so", startSec: 1.0, endSec: 1.2 },
			{ text: "[UM]", startSec: 1.22, endSec: 1.6 },
			{ text: "today", startSec: 1.62, endSec: 2.0 },
		]);
		expect(spans).toEqual([{ startMs: 1200, endMs: 1620, reason: "filler" }]);
	});
});

describe("buildCleanupTrims", () => {
	it("merges near cuts, removes what existing trims cover and drops slivers", () => {
		const trims = buildCleanupTrims(
			[
				{ startMs: 1000, endMs: 1500 },
				{ startMs: 1550, endMs: 2000 },
				{ startMs: 5000, endMs: 5050 },
				{ startMs: 8000, endMs: 9000 },
				{ startMs: 9800, endMs: 10_400 },
			],
			[{ startMs: 8500, endMs: 12_000 }],
			10_000,
		);
		expect(trims).toEqual([
			{ startMs: 1000, endMs: 2000 },
			{ startMs: 8000, endMs: 8500 },
		]);
	});

	it("moves microphone-timeline spans onto the screen timeline", () => {
		expect(shiftSpans([{ startMs: 100, endMs: 200 }], 250)).toEqual([{ startMs: 350, endMs: 450 }]);
	});
});

it("writes a valid 16-bit mono WAV header", () => {
	const wav = new DataView(encodeWav16(new Float32Array([0, 1, -1]), RATE));
	expect(
		String.fromCharCode(wav.getUint8(0), wav.getUint8(1), wav.getUint8(2), wav.getUint8(3)),
	).toBe("RIFF");
	expect(wav.getUint32(24, true)).toBe(RATE);
	expect(wav.getInt16(46, true)).toBe(32767);
	expect(wav.getInt16(48, true)).toBe(-32768);
});
