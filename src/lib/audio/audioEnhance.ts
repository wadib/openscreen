/**
 * Export-time voice enhancement for the final mixed audio:
 * - high-pass: removes rumble and desk thumps below ~80 Hz;
 * - noise reduction: a downward expander that lowers the background between words;
 * - loudness: normalises to a target integrated loudness (ITU-R BS.1770, gated) with a
 *   peak limiter so the gain never clips.
 */

export interface AudioEnhancement {
	highpass: boolean;
	denoise: boolean;
	normalize: boolean;
}

export const NO_AUDIO_ENHANCEMENT: AudioEnhancement = {
	highpass: false,
	denoise: false,
	normalize: false,
};

export const TARGET_LOUDNESS_LUFS = -16;
const PEAK_CEILING = 10 ** (-1 / 20); // -1 dBFS
const HIGHPASS_HZ = 80;

export function hasAudioEnhancement(enhancement?: Partial<AudioEnhancement> | null): boolean {
	return Boolean(enhancement?.highpass || enhancement?.denoise || enhancement?.normalize);
}

export function normalizeAudioEnhancement(value: unknown): AudioEnhancement {
	const raw = (value && typeof value === "object" ? value : {}) as Partial<AudioEnhancement>;
	return {
		highpass: raw.highpass === true,
		denoise: raw.denoise === true,
		normalize: raw.normalize === true,
	};
}

function copyBuffer(buffer: AudioBuffer): AudioBuffer {
	const copy = new AudioBuffer({
		numberOfChannels: buffer.numberOfChannels,
		length: buffer.length,
		sampleRate: buffer.sampleRate,
	});
	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		copy.copyToChannel(buffer.getChannelData(channel), channel);
	}
	return copy;
}

async function filtered(
	buffer: AudioBuffer,
	build: (context: OfflineAudioContext) => AudioNode[],
): Promise<AudioBuffer> {
	const context = new OfflineAudioContext(
		buffer.numberOfChannels,
		buffer.length,
		buffer.sampleRate,
	);
	const source = context.createBufferSource();
	source.buffer = buffer;
	let node: AudioNode = source;
	for (const next of build(context)) {
		node.connect(next);
		node = next;
	}
	node.connect(context.destination);
	source.start(0);
	return context.startRendering();
}

export function highpass(buffer: AudioBuffer, frequency = HIGHPASS_HZ): Promise<AudioBuffer> {
	return filtered(buffer, (context) => {
		const stages = [0, 1].map(() => {
			const filter = context.createBiquadFilter();
			filter.type = "highpass";
			filter.frequency.value = frequency;
			filter.Q.value = Math.SQRT1_2;
			return filter;
		});
		return stages;
	});
}

/** Direct-form biquad, in place. */
function biquad(data: Float32Array, b: number[], a: number[]): Float32Array {
	const out = new Float32Array(data.length);
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	for (let index = 0; index < data.length; index++) {
		const x = data[index];
		const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
		x2 = x1;
		x1 = x;
		y2 = y1;
		y1 = y;
		out[index] = y;
	}
	return out;
}

/**
 * BS.1770 K-weighting filters for any sample rate (the formulation used by libebur128):
 * a +4 dB high shelf around 1.7 kHz followed by the RLB high-pass at 38 Hz.
 */
export function kWeightingCoefficients(sampleRate: number) {
	let f0 = 1681.974450955533;
	const gainDb = 3.999843853973347;
	let q = 0.7071752369554196;
	let k = Math.tan((Math.PI * f0) / sampleRate);
	const vh = 10 ** (gainDb / 20);
	const vb = vh ** 0.4996667741545416;
	let a0 = 1 + k / q + k * k;
	const shelf = {
		b: [
			(vh + (vb * k) / q + k * k) / a0,
			(2 * (k * k - vh)) / a0,
			(vh - (vb * k) / q + k * k) / a0,
		],
		a: [1, (2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0],
	};
	f0 = 38.13547087602444;
	q = 0.5003270373238773;
	k = Math.tan((Math.PI * f0) / sampleRate);
	a0 = 1 + k / q + k * k;
	const highpassFilter = {
		b: [1, -2, 1],
		a: [1, (2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0],
	};
	return { shelf, highpass: highpassFilter };
}

/**
 * Integrated loudness in LUFS (BS.1770-4: K-weighting, 400 ms blocks with 75% overlap,
 * absolute gate -70 LUFS, relative gate -10 LU). Returns -Infinity for silence.
 */
export async function measureLoudness(buffer: AudioBuffer): Promise<number> {
	const { shelf, highpass: rlb } = kWeightingCoefficients(buffer.sampleRate);
	const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
		biquad(biquad(buffer.getChannelData(channel), shelf.b, shelf.a), rlb.b, rlb.a),
	);
	const block = Math.round(0.4 * buffer.sampleRate);
	const step = Math.round(0.1 * buffer.sampleRate);
	// Running sums of squares per 100 ms step make overlapping blocks cheap.
	const steps = Math.floor(buffer.length / step);
	const stepPower = new Float64Array(steps);
	for (const data of channels) {
		for (let index = 0; index < steps; index++) {
			let sum = 0;
			for (let sample = index * step; sample < (index + 1) * step; sample++)
				sum += data[sample] * data[sample];
			stepPower[index] += sum;
		}
	}
	const stepsPerBlock = Math.round(block / step);
	const blocks: number[] = [];
	for (let start = 0; start + stepsPerBlock <= steps; start++) {
		let sum = 0;
		for (let index = start; index < start + stepsPerBlock; index++) sum += stepPower[index];
		blocks.push(sum / (stepsPerBlock * step));
	}
	const loudness = (power: number) => -0.691 + 10 * Math.log10(power + 1e-20);
	const absolute = blocks.filter((power) => loudness(power) > -70);
	if (!absolute.length) return -Infinity;
	const relativeGate = loudness(absolute.reduce((a, b) => a + b, 0) / absolute.length) - 10;
	const gated = absolute.filter((power) => loudness(power) > relativeGate);
	return loudness(gated.reduce((a, b) => a + b, 0) / gated.length);
}

/** Per-block gain curve applied with linear interpolation between block centres. */
function applyBlockGains(buffer: AudioBuffer, gains: Float32Array, blockSize: number): void {
	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		const data = buffer.getChannelData(channel);
		for (let index = 0; index < data.length; index++) {
			const position = index / blockSize - 0.5;
			const left = Math.max(0, Math.min(gains.length - 1, Math.floor(position)));
			const right = Math.min(gains.length - 1, left + 1);
			const fraction = Math.max(0, Math.min(1, position - left));
			data[index] *= gains[left] + (gains[right] - gains[left]) * fraction;
		}
	}
}

/**
 * Downward expander: blocks quieter than the noise floor + 6 dB are lowered by up to 12 dB,
 * with fast attack and slow release so word endings are not chopped.
 */
export function reduceNoise(buffer: AudioBuffer): AudioBuffer {
	const out = copyBuffer(buffer);
	const blockSize = Math.max(1, Math.round(buffer.sampleRate * 0.01));
	const count = Math.ceil(buffer.length / blockSize);
	const levels = new Float32Array(count);
	for (let block = 0; block < count; block++) {
		let sum = 0;
		let samples = 0;
		for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
			const data = buffer.getChannelData(channel);
			const end = Math.min(data.length, (block + 1) * blockSize);
			for (let index = block * blockSize; index < end; index++) {
				sum += data[index] * data[index];
				samples++;
			}
		}
		levels[block] = 10 * Math.log10(sum / Math.max(1, samples) + 1e-12);
	}
	const sorted = Array.from(levels).sort((a, b) => a - b);
	const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -120;
	const speech = sorted[Math.floor(sorted.length * 0.9)] ?? -120;
	// Nothing to separate: leave quiet or noise-only audio alone.
	if (speech - floor < 10) return out;
	const threshold = floor + 6;
	const target = new Float32Array(count);
	for (let block = 0; block < count; block++) {
		const below = threshold - levels[block];
		const reductionDb = below > 0 ? Math.min(12, below * 2) : 0;
		target[block] = 10 ** (-reductionDb / 20);
	}
	const gains = new Float32Array(count);
	let current = 1;
	for (let block = 0; block < count; block++) {
		// Attack: open within ~10 ms; release: close over ~150 ms. Look ahead one block so
		// the start of a word is never attenuated.
		const wanted = Math.max(target[block], target[Math.min(count - 1, block + 1)]);
		current = wanted > current ? wanted : current + (wanted - current) * 0.07;
		gains[block] = current;
	}
	applyBlockGains(out, gains, blockSize);
	return out;
}

/** Look-ahead peak limiter (5 ms) keeping samples under the ceiling. */
export function limitPeaks(buffer: AudioBuffer, ceiling = PEAK_CEILING): AudioBuffer {
	const blockSize = Math.max(1, Math.round(buffer.sampleRate * 0.001));
	const count = Math.ceil(buffer.length / blockSize);
	const required = new Float32Array(count).fill(1);
	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		const data = buffer.getChannelData(channel);
		for (let block = 0; block < count; block++) {
			let peak = 0;
			const end = Math.min(data.length, (block + 1) * blockSize);
			for (let index = block * blockSize; index < end; index++)
				peak = Math.max(peak, Math.abs(data[index]));
			if (peak > ceiling) required[block] = Math.min(required[block], ceiling / peak);
		}
	}
	const gains = new Float32Array(count);
	const lookahead = 5;
	let current = 1;
	for (let block = 0; block < count; block++) {
		let wanted = 1;
		for (let ahead = 0; ahead <= lookahead && block + ahead < count; ahead++) {
			wanted = Math.min(wanted, required[block + ahead]);
		}
		current = wanted < current ? wanted : current + (wanted - current) * 0.02;
		gains[block] = Math.min(current, required[block]);
	}
	applyBlockGains(buffer, gains, blockSize);
	// Interpolation can leave a stray sample a hair above the ceiling.
	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		const data = buffer.getChannelData(channel);
		for (let index = 0; index < data.length; index++) {
			if (data[index] > ceiling) data[index] = ceiling;
			else if (data[index] < -ceiling) data[index] = -ceiling;
		}
	}
	return buffer;
}

export async function normalizeLoudness(
	buffer: AudioBuffer,
	targetLufs = TARGET_LOUDNESS_LUFS,
): Promise<AudioBuffer> {
	let measured = await measureLoudness(buffer);
	if (!Number.isFinite(measured)) return buffer;
	let out = copyBuffer(buffer);
	let totalGainDb = 0;
	// Limiting peaks takes some loudness back, so measure again and make up the difference.
	for (let pass = 0; pass < 3; pass++) {
		// Cap the total boost so near-silent tracks are not pushed into pure noise.
		const gainDb = Math.max(-20 - totalGainDb, Math.min(20 - totalGainDb, targetLufs - measured));
		if (Math.abs(gainDb) < 0.2) break;
		totalGainDb += gainDb;
		const gain = 10 ** (gainDb / 20);
		for (let channel = 0; channel < out.numberOfChannels; channel++) {
			const data = out.getChannelData(channel);
			for (let index = 0; index < data.length; index++) data[index] *= gain;
		}
		out = limitPeaks(out);
		measured = await measureLoudness(out);
	}
	return out;
}

/** Apply the enabled steps in signal order: high-pass → noise reduction → loudness. */
export async function enhanceAudioBuffer(
	buffer: AudioBuffer,
	enhancement: AudioEnhancement,
): Promise<AudioBuffer> {
	let out = buffer;
	if (enhancement.highpass) out = await highpass(out);
	if (enhancement.denoise) out = reduceNoise(out);
	if (enhancement.normalize) out = await normalizeLoudness(out);
	return out;
}
