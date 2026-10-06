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
