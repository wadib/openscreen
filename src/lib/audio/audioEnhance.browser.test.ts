import { expect, it } from "vitest";
import {
	enhanceAudioBuffer,
	highpass,
	measureLoudness,
	normalizeLoudness,
	reduceNoise,
	TARGET_LOUDNESS_LUFS,
} from "./audioEnhance";

const RATE = 48_000;

function tone(seconds: number, frequency: number, amplitude: number, channels = 2): AudioBuffer {
	const buffer = new AudioBuffer({
		numberOfChannels: channels,
		length: seconds * RATE,
		sampleRate: RATE,
	});
	for (let channel = 0; channel < channels; channel++) {
		const data = buffer.getChannelData(channel);
		for (let index = 0; index < data.length; index++) {
			data[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / RATE);
		}
	}
	return buffer;
}

function rms(data: Float32Array, from = 0, to = data.length): number {
	const start = Math.round(from);
	const end = Math.round(to);
	let sum = 0;
	for (let index = start; index < end; index++) sum += data[index] * data[index];
	return Math.sqrt(sum / (end - start));
}

it("measures a full-scale stereo 1 kHz sine near 0 LUFS (BS.1770)", async () => {
	// A 0 dBFS 1 kHz sine in one channel reads -3.01 LUFS; in both channels about 0 LUFS.
	const loudness = await measureLoudness(tone(5, 1000, 1));
	expect(loudness).toBeGreaterThan(-0.8);
	expect(loudness).toBeLessThan(0.8);
});

it("normalises a quiet voice to the target without exceeding -1 dBFS", async () => {
	const quiet = tone(6, 300, 0.02);
	const out = await normalizeLoudness(quiet);
	expect(Math.abs((await measureLoudness(out)) - TARGET_LOUDNESS_LUFS)).toBeLessThan(0.3);
	const data = out.getChannelData(0);
	expect(Math.max(...data.subarray(0, 48_000))).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6);
});

it("limits peaks when the loudness gain would clip", async () => {
	// Short loud spikes on a quiet bed: reaching the target needs gain that would clip the spikes.
	const buffer = tone(6, 300, 0.03);
	for (let channel = 0; channel < 2; channel++) {
		const data = buffer.getChannelData(channel);
		for (let spike = 0; spike < 6; spike++) data[spike * RATE + 100] = 0.9;
	}
	const out = await normalizeLoudness(buffer);
	// The limited spikes must not cost loudness: the make-up pass still reaches the target.
	expect(Math.abs((await measureLoudness(out)) - TARGET_LOUDNESS_LUFS)).toBeLessThan(0.3);
	for (let channel = 0; channel < 2; channel++) {
		for (const value of out.getChannelData(channel)) {
			expect(Math.abs(value)).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6);
		}
	}
});

it("removes rumble below the voice range", async () => {
	const rumble = tone(2, 30, 0.5, 1);
	const voice = tone(2, 1000, 0.5, 1);
	const rumbleOut = await highpass(rumble);
	const voiceOut = await highpass(voice);
	expect(rms(rumbleOut.getChannelData(0), RATE)).toBeLessThan(0.05);
	expect(rms(voiceOut.getChannelData(0), RATE)).toBeGreaterThan(0.33);
});

it("lowers the background between words but keeps the words", () => {
	const buffer = new AudioBuffer({ numberOfChannels: 1, length: 6 * RATE, sampleRate: RATE });
	const data = buffer.getChannelData(0);
	let seed = 9;
	for (let index = 0; index < data.length; index++) {
		seed = (seed * 16807) % 2147483647;
		const noise = 0.003 * (seed / 2147483647 - 0.5);
		const speaking = Math.floor(index / RATE) % 2 === 0;
		data[index] = noise + (speaking ? 0.3 * Math.sin((2 * Math.PI * 220 * index) / RATE) : 0);
	}
	const out = reduceNoise(buffer).getChannelData(0);
	// Middle of a pause (second 1.3–1.7): at least 8 dB quieter.
	expect(rms(out, 1.3 * RATE, 1.7 * RATE)).toBeLessThan(rms(data, 1.3 * RATE, 1.7 * RATE) * 0.4);
	// Middle of a word: unchanged.
	expect(rms(out, 2.3 * RATE, 2.7 * RATE)).toBeCloseTo(rms(data, 2.3 * RATE, 2.7 * RATE), 3);
});

it("chains the enabled steps", async () => {
	const out = await enhanceAudioBuffer(tone(4, 400, 0.05), {
		highpass: true,
		denoise: true,
		normalize: true,
	});
	expect(out.length).toBe(4 * RATE);
	expect(Math.abs((await measureLoudness(out)) - TARGET_LOUDNESS_LUFS)).toBeLessThan(1);
});
