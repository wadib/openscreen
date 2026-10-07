import { describe, expect, it } from "vitest";
import { estimateOffset, fft, measureSync, RELIABLE_SYNC_CONFIDENCE } from "./audioSync";

const RATE = 8000;

function rng(seed: number) {
	return () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647 - 0.5;
	};
}

/** Irregular speech-like bursts. */
function bursts(seconds: number, seed = 7): Float32Array {
	const random = rng(seed);
	const out = new Float32Array(seconds * RATE);
	let position = 0;
	while (position < out.length) {
		const gap = Math.round((0.1 + Math.abs(random()) * 0.8) * RATE);
		const length = Math.round((0.05 + Math.abs(random()) * 0.4) * RATE);
		position += gap;
		for (let index = 0; index < length && position + index < out.length; index++) {
			out[position + index] = (0.2 + Math.abs(random())) * Math.sin(index * 0.3) + 0.05 * random();
		}
		position += length;
	}
	return out;
}

/** Same sound, delayed, filtered and noisier — like a second microphone. */
function delayed(source: Float32Array, delayMs: number, seed = 3): Float32Array {
	const random = rng(seed);
	const shift = Math.round((delayMs / 1000) * RATE);
	const out = new Float32Array(source.length);
	let smooth = 0;
	for (let index = 0; index < out.length; index++) {
		const value = index - shift >= 0 && index - shift < source.length ? source[index - shift] : 0;
		smooth = smooth * 0.6 + value * 0.4;
		out[index] = 0.5 * smooth + 0.02 * random();
	}
	return out;
}

describe("fft", () => {
	it("round-trips", () => {
		const real = Float64Array.from([1, 2, 3, 4, 0, 0, 0, 0]);
		const imag = new Float64Array(8);
		fft(real, imag);
		fft(real, imag, true);
		expect(Array.from(real, (value) => Math.round(value / 8))).toEqual([1, 2, 3, 4, 0, 0, 0, 0]);
	});
});

describe("estimateOffset", () => {
	it("finds a positive delay (reference later than the microphone)", () => {
		const mic = bursts(60);
		const reference = delayed(mic, 437);
		const result = estimateOffset(reference, mic, RATE);
		expect(Math.abs(result.offsetMs - 437)).toBeLessThanOrEqual(3);
		expect(result.confidence).toBeGreaterThan(RELIABLE_SYNC_CONFIDENCE);
	});

	it("finds a negative delay", () => {
		const reference = bursts(60, 11);
		const mic = delayed(reference, 1250);
		const result = estimateOffset(reference, mic, RATE);
		expect(Math.abs(result.offsetMs + 1250)).toBeLessThanOrEqual(3);
	});

	it("reports low confidence for unrelated audio", () => {
		const result = estimateOffset(bursts(60, 5), bursts(60, 99), RATE);
		expect(result.confidence).toBeLessThan(RELIABLE_SYNC_CONFIDENCE);
	});
});

it("measures drift between the start and the end", () => {
	const mic = bursts(600, 21);
	// Reference runs 0.1% slow: 0 ms late at the start, ~600 ms late at the end.
	const reference = new Float32Array(mic.length);
	for (let index = 0; index < reference.length; index++) {
		reference[index] = mic[Math.floor(index / 1.001)] ?? 0;
	}
	const result = measureSync(reference, mic, RATE, { windowSec: 60 });
	expect(Math.abs(result.offsetMs)).toBeLessThan(40);
	expect(result.endOffsetMs).toBeGreaterThan(500);
});
