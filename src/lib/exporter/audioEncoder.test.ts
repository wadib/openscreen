import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@mediabunny/aac-encoder", () => ({ registerAacEncoder: vi.fn() }));

import { AudioProcessor, downmixPlanarChannelsForExport } from "./audioEncoder";

describe("AudioProcessor.selectSupportedExportCodec", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("falls back to stereo when the source channel count cannot be encoded", async () => {
		const isConfigSupported = vi.fn(async (config: AudioEncoderConfig) => ({
			config,
			supported:
				config.codec === "mp4a.40.2" &&
				config.sampleRate === 44100 &&
				config.numberOfChannels === 2,
		}));
		vi.stubGlobal("AudioEncoder", { isConfigSupported });

		const codec = await AudioProcessor.selectSupportedExportCodec(44100, 8);

		expect(codec).toMatchObject({
			encoderCodec: "mp4a.40.2",
			muxerCodec: "aac",
			sampleRate: 44100,
			numberOfChannels: 2,
		});
		expect(isConfigSupported).toHaveBeenCalledWith({
			codec: "mp4a.40.2",
			sampleRate: 44100,
			numberOfChannels: 8,
			bitrate: 128000,
		});
		expect(isConfigSupported).toHaveBeenCalledWith({
			codec: "mp4a.40.2",
			sampleRate: 44100,
			numberOfChannels: 2,
			bitrate: 128000,
		});
	});
});

describe("downmixPlanarChannelsForExport", () => {
	it("preserves non-front Windows system audio channels when exporting stereo", () => {
		const sourcePlanes = Array.from({ length: 8 }, (_, channel) => {
			const plane = new Float32Array(2);
			if (channel === 2) {
				plane[0] = 0.8;
				plane[1] = 0.4;
			}
			if (channel === 6) {
				plane[0] = 0.2;
				plane[1] = 0.1;
			}
			return plane;
		});

		const stereo = downmixPlanarChannelsForExport(sourcePlanes, 2);

		expect(stereo[0]).toBeGreaterThan(0);
		expect(stereo[1]).toBeGreaterThan(0);
		expect(stereo[2]).toBeGreaterThan(0);
		expect(stereo[3]).toBeGreaterThan(0);
	});

	it("duplicates mono microphone audio when exporting stereo", () => {
		const mono = new Float32Array([0.25, -0.5]);

		const stereo = downmixPlanarChannelsForExport([mono], 2);

		expect(Array.from(stereo)).toEqual([0.25, -0.5, 0.25, -0.5]);
	});
});

describe("AudioProcessor.encodeAudioBuffer backpressure", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("drains a backed-up encoder without a mid-stream flush, keeping chunk timestamps increasing", async () => {
		const sampleRate = 48000;
		const FakeAudioData = class {
			timestamp: number;
			numberOfFrames: number;
			constructor(init: { timestamp: number; numberOfFrames: number }) {
				this.timestamp = init.timestamp;
				this.numberOfFrames = init.numberOfFrames;
			}
			close() {
				// Fake frames hold no native resources.
			}
		};
		// Mimics a real encoder that falls behind: queued work runs on later ticks, and flush()
		// pads the trailing partial frame, emitting a chunk that runs past the next input's start.
		const FakeAudioEncoder = class {
			state = "unconfigured";
			pending: { timestamp: number; frames: number }[] = [];
			last = { timestamp: 0, frames: 0 };
			constructor(private readonly init: { output: (chunk: { timestamp: number }) => void }) {}
			get encodeQueueSize() {
				return this.pending.length;
			}
			configure() {
				this.state = "configured";
			}
			encode(audio: { timestamp: number; numberOfFrames: number }) {
				this.pending.push({ timestamp: audio.timestamp, frames: audio.numberOfFrames });
				setTimeout(() => this.emitOne(), 0);
			}
			emitOne() {
				const next = this.pending.shift();
				if (!next) return;
				this.last = next;
				this.init.output({ timestamp: next.timestamp });
			}
			async flush() {
				while (this.pending.length) this.emitOne();
				const padded = this.last.timestamp + (this.last.frames * 1_000_000) / sampleRate + 1333;
				this.init.output({ timestamp: padded });
			}
			close() {
				this.state = "closed";
			}
		};
		vi.stubGlobal("AudioData", FakeAudioData);
		vi.stubGlobal("AudioEncoder", FakeAudioEncoder);

		const seconds = 10;
		const pcm = new Float32Array(sampleRate * seconds);
		const buffer = {
			sampleRate,
			numberOfChannels: 1,
			length: pcm.length,
			getChannelData: () => pcm,
		};
		const timestamps: number[] = [];
		const muxer = {
			addAudioChunk: async (chunk: { timestamp: number }) => {
				const largest = timestamps.length ? Math.max(...timestamps) : -1;
				if (chunk.timestamp < largest)
					throw new Error("Timestamps cannot be smaller than the largest timestamp");
				timestamps.push(chunk.timestamp);
			},
		};
		const processor = new AudioProcessor() as unknown as {
			encodeAudioBuffer: (b: unknown, m: unknown, c: unknown) => Promise<void>;
		};
		await processor.encodeAudioBuffer(buffer, muxer, {
			encoderCodec: "mp4a.40.2",
			muxerCodec: "aac",
			sampleRate,
			numberOfChannels: 1,
		});
		expect(timestamps.length).toBeGreaterThan(100);
		for (let i = 1; i < timestamps.length; i++)
			expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
	});
});

describe("AudioProcessor software AAC fallback", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("prefers software AAC over Opus when WebCodecs cannot encode AAC", async () => {
		vi.stubGlobal("AudioEncoder", {
			isConfigSupported: vi.fn(async (config: AudioEncoderConfig) => ({
				config,
				supported: config.codec === "opus",
			})),
		});

		const codec = await AudioProcessor.selectSupportedExportCodec(48000, 2);

		expect(codec).toMatchObject({
			encoderCodec: "mp4a.40.2",
			muxerCodec: "aac",
			software: true,
			sampleRate: 48000,
			numberOfChannels: 2,
		});
	});

	it("keeps Opus when the sample rate is not an AAC rate", async () => {
		vi.stubGlobal("AudioEncoder", {
			isConfigSupported: vi.fn(async (config: AudioEncoderConfig) => ({
				config,
				supported: config.codec === "opus",
			})),
		});

		const codec = await AudioProcessor.selectSupportedExportCodec(37000, 2);

		expect(codec).toMatchObject({ muxerCodec: "opus" });
		expect(codec?.software).toBeUndefined();
	});
});
