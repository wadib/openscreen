import { expect, it } from "vitest";
import { AudioProcessor } from "./audioEncoder";

it("encodes a long microphone mix with strictly increasing chunk timestamps", async () => {
	const sampleRate = 48000;
	const seconds = 60;
	const buffer = new AudioBuffer({ numberOfChannels: 2, length: sampleRate * seconds, sampleRate });
	for (let channel = 0; channel < 2; channel++) {
		const pcm = buffer.getChannelData(channel);
		for (let i = 0; i < pcm.length; i++)
			pcm[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / sampleRate);
	}
	const codec = await AudioProcessor.selectSupportedExportCodec(sampleRate, 2);
	expect(codec).toBeTruthy();
	const timestamps: number[] = [];
	const muxer = {
		addAudioChunk: async (chunk: EncodedAudioChunk) => {
			timestamps.push(chunk.timestamp);
		},
	};
	const processor = new AudioProcessor();
	// The backpressure path used to flush the encoder mid-stream, which produced a chunk that
	// started before the previous (padded) one ended; the MP4 muxer rejects that at export end.
	await (
		processor as unknown as {
			encodeAudioBuffer: (b: AudioBuffer, m: typeof muxer, c: typeof codec) => Promise<void>;
		}
	).encodeAudioBuffer(buffer, muxer, codec);
	expect(timestamps.length).toBeGreaterThan(seconds * 40);
	for (let i = 1; i < timestamps.length; i++) {
		expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
	}
	const lastSec = timestamps[timestamps.length - 1] / 1_000_000;
	expect(lastSec).toBeGreaterThan(seconds - 0.1);
	expect(lastSec).toBeLessThan(seconds + 0.1);
});

it("writes an AAC track through the software encoder when WebCodecs has no AAC (Linux)", async () => {
	const { ALL_FORMATS, BlobSource, Input } = await import("mediabunny");
	const { VideoMuxer } = await import("./muxer");
	expect(await (await import("./audioEncoder")).ensureSoftwareAacEncoder()).toBe(true);

	const sampleRate = 48000;
	const seconds = 3;
	const buffer = new AudioBuffer({ numberOfChannels: 2, length: sampleRate * seconds, sampleRate });
	for (let channel = 0; channel < 2; channel++) {
		const pcm = buffer.getChannelData(channel);
		for (let i = 0; i < pcm.length; i++)
			pcm[i] = 0.2 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
	}
	const codec = {
		encoderCodec: "mp4a.40.2",
		muxerCodec: "aac" as const,
		label: "AAC (software)",
		sampleRate,
		numberOfChannels: 2,
		software: true,
	};
	const width = 64;
	const height = 64;
	const muxer = new VideoMuxer(
		{ width, height, frameRate: 30, bitrate: 500_000, codec: "avc1.42E01E" } as never,
		true,
		"aac",
		"samples",
	);
	await muxer.initialize();

	// One video frame so the MP4 has a video track, as a real export does.
	let videoDone = Promise.resolve();
	const videoEncoder = new VideoEncoder({
		output: (chunk, meta) => {
			videoDone = videoDone.then(() => muxer.addVideoChunk(chunk, meta));
		},
		error: (error) => {
			throw error;
		},
	});
	videoEncoder.configure({ codec: "avc1.42E01E", width, height, bitrate: 500_000 });
	const canvas = new OffscreenCanvas(width, height);
	canvas.getContext("2d")?.fillRect(0, 0, width, height);
	const frame = new VideoFrame(canvas, { timestamp: 0, duration: 33_333 });
	videoEncoder.encode(frame, { keyFrame: true });
	frame.close();
	await videoEncoder.flush();
	await videoDone;

	await (
		new AudioProcessor() as unknown as {
			encodeAudioBuffer: (b: AudioBuffer, m: typeof muxer, c: typeof codec) => Promise<void>;
		}
	).encodeAudioBuffer(buffer, muxer, codec);
	const blob = await muxer.finalize();

	const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
	const track = await input.getPrimaryAudioTrack();
	expect(track?.codec).toBe("aac");
	expect(track?.numberOfChannels).toBe(2);
	expect(await track?.computeDuration()).toBeGreaterThan(seconds - 0.1);
});
