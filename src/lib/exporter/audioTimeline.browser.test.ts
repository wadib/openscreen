import { expect, it } from "vitest";
import { renderAudioTimeline } from "./audioTimeline";

it("mixes microphone samples at exact offsets across trims and silence", async () => {
	const sampleRate = 48000;
	const microphone = new AudioBuffer({ numberOfChannels: 1, length: sampleRate * 2, sampleRate });
	const pcm = microphone.getChannelData(0);
	pcm[4800] = 0.5;
	pcm[62400] = 0.75;
	const output = await renderAudioTimeline(null, microphone, {
		durationSec: 3,
		sampleRate,
		channels: 1,
		trimRegions: [{ id: "trim", startMs: 500, endMs: 1000 }],
		microphoneOffsetMs: 200,
		microphoneGain: 1,
		microphoneMuted: false,
	});
	expect(output!.length).toBe(sampleRate * 2.5);
	const mixed = output!.getChannelData(0);
	expect(mixed[14400]).toBeCloseTo(0.5, 4);
	expect(mixed[48000]).toBeCloseTo(0.75, 4);
	expect(mixed[0]).toBe(0);
	expect(mixed[output!.length - 1]).toBe(0);
});

it("mixes system audio while keeping a muted microphone silent", async () => {
	const system = new AudioBuffer({ numberOfChannels: 1, length: 48000, sampleRate: 48000 });
	system.getChannelData(0)[24000] = 0.25;
	const output = await renderAudioTimeline(system, system, {
		durationSec: 1,
		sampleRate: 48000,
		channels: 1,
		trimRegions: [],
		microphoneOffsetMs: 0,
		microphoneGain: 2,
		microphoneMuted: true,
	});
	expect(output!.getChannelData(0)[24000]).toBeCloseTo(0.25, 5);
});
