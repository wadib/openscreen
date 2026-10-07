/**
 * Automatic microphone sync: find the delay between two recordings of the same sound
 * (for example the microphone track and the webcam or screen audio) by cross-correlating
 * their onset envelopes with an FFT. Pure functions on mono sample arrays.
 */

export interface SyncEstimate {
	/** How much later the reference hears a sound than the target (ms). */
	offsetMs: number;
	/** Peak height above the correlation noise, in standard deviations. Above ~8 is reliable. */
	confidence: number;
}

export interface SyncResult extends SyncEstimate {
	/** Offset measured near the end; differs from offsetMs when one track drifts. */
	endOffsetMs?: number;
	endConfidence?: number;
}

export const RELIABLE_SYNC_CONFIDENCE = 8;
const ENVELOPE_RATE = 1000;

/** In-place iterative radix-2 FFT. `inverse` computes the unscaled inverse. */
export function fft(real: Float64Array, imag: Float64Array, inverse = false): void {
	const size = real.length;
	for (let index = 1, swap = 0; index < size; index++) {
		let bit = size >> 1;
		for (; swap & bit; bit >>= 1) swap ^= bit;
		swap ^= bit;
		if (index < swap) {
			[real[index], real[swap]] = [real[swap], real[index]];
			[imag[index], imag[swap]] = [imag[swap], imag[index]];
		}
	}
	for (let length = 2; length <= size; length <<= 1) {
		const angle = ((inverse ? 2 : -2) * Math.PI) / length;
		const stepReal = Math.cos(angle);
		const stepImag = Math.sin(angle);
		for (let start = 0; start < size; start += length) {
			let wReal = 1;
			let wImag = 0;
			for (let offset = 0; offset < length / 2; offset++) {
				const a = start + offset;
				const b = a + length / 2;
				const tReal = real[b] * wReal - imag[b] * wImag;
				const tImag = real[b] * wImag + imag[b] * wReal;
				real[b] = real[a] - tReal;
				imag[b] = imag[a] - tImag;
				real[a] += tReal;
				imag[a] += tImag;
				const nextReal = wReal * stepReal - wImag * stepImag;
				wImag = wReal * stepImag + wImag * stepReal;
				wReal = nextReal;
			}
		}
	}
}

/**
 * Onset envelope at 1 kHz: rises in loudness, which line up between microphones even when
 * their tone, gain and noise differ.
 */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): Float64Array {
	const block = Math.max(1, Math.round(sampleRate / ENVELOPE_RATE));
	const count = Math.floor(samples.length / block);
	const level = new Float64Array(count);
	for (let index = 0; index < count; index++) {
		let sum = 0;
		for (let offset = 0; offset < block; offset++) sum += Math.abs(samples[index * block + offset]);
		level[index] = Math.log1p((sum / block) * 1000);
	}
	const onset = new Float64Array(count);
	for (let index = 1; index < count; index++)
		onset[index] = Math.max(0, level[index] - level[index - 1]);
	let mean = 0;
	for (const value of onset) mean += value;
	mean /= Math.max(1, count);
	for (let index = 0; index < count; index++) onset[index] -= mean;
	return onset;
}

/** Delay of `reference` relative to `target` within ±maxLagMs. */
export function estimateOffset(
	reference: Float32Array,
	target: Float32Array,
	sampleRate: number,
	maxLagMs = 30_000,
): SyncEstimate {
	const ref = onsetEnvelope(reference, sampleRate);
	const tgt = onsetEnvelope(target, sampleRate);
	let size = 1;
	while (size < ref.length + tgt.length) size <<= 1;
	const aReal = new Float64Array(size);
	const aImag = new Float64Array(size);
	const bReal = new Float64Array(size);
	const bImag = new Float64Array(size);
	aReal.set(ref);
	bReal.set(tgt);
	fft(aReal, aImag);
	fft(bReal, bImag);
	// corr[k] = sum_i ref[i + k] * tgt[i]  →  FFT(ref) * conj(FFT(tgt))
	for (let index = 0; index < size; index++) {
		const real = aReal[index] * bReal[index] + aImag[index] * bImag[index];
		const imag = aImag[index] * bReal[index] - aReal[index] * bImag[index];
		aReal[index] = real;
		aImag[index] = imag;
	}
	fft(aReal, aImag, true);

	const maxLag = Math.min(Math.round((maxLagMs * ENVELOPE_RATE) / 1000), size / 2 - 1);
	let bestLag = 0;
	let best = -Infinity;
	let sum = 0;
	let sumSquares = 0;
	let count = 0;
	for (let lag = -maxLag; lag <= maxLag; lag++) {
		const value = aReal[(lag + size) % size];
		sum += value;
		sumSquares += value * value;
		count++;
		if (value > best) {
			best = value;
			bestLag = lag;
		}
	}
	const mean = sum / count;
	const deviation = Math.sqrt(Math.max(1e-24, sumSquares / count - mean * mean));
	return {
		offsetMs: (bestLag * 1000) / ENVELOPE_RATE,
		confidence: (best - mean) / deviation,
	};
}

/**
 * Measure the offset from the first `windowSec` of both tracks, and again near the end so the
 * caller can warn about drift. The reference timeline is the screen timeline.
 */
export function measureSync(
	reference: Float32Array,
	target: Float32Array,
	sampleRate: number,
	options: { windowSec?: number; maxLagMs?: number } = {},
): SyncResult {
	const windowSec = options.windowSec ?? 240;
	const maxLagMs = options.maxLagMs ?? 30_000;
	const window = Math.round(windowSec * sampleRate);
	const pad = Math.round((maxLagMs / 1000) * sampleRate);
	const start = estimateOffset(
		reference.subarray(0, window + pad),
		target.subarray(0, window + pad),
		sampleRate,
		maxLagMs,
	);
	const result: SyncResult = { ...start };
	const length = Math.min(
		reference.length,
		target.length + Math.round((start.offsetMs / 1000) * sampleRate),
	);
	if (length > 2 * (window + pad)) {
		// Compare the last window, aligned by the start offset, with a narrow search.
		const refStart = length - window;
		const tgtStart = Math.max(0, refStart - Math.round((start.offsetMs / 1000) * sampleRate));
		const end = estimateOffset(
			reference.subarray(refStart, refStart + window),
			target.subarray(tgtStart, tgtStart + window),
			sampleRate,
			2000,
		);
		result.endOffsetMs = start.offsetMs + end.offsetMs;
		result.endConfidence = end.confidence;
	}
	return result;
}

/**
 * Microphone offset for the editor (positive delays the microphone) from a measurement made
 * against a reference whose own offset on the screen timeline is `referenceOffsetMs`
 * (0 for screen audio, the webcam offset for webcam audio).
 */
export function microphoneOffsetFromMeasurement(offsetMs: number, referenceOffsetMs = 0): number {
	return Math.round(offsetMs + referenceOffsetMs);
}
