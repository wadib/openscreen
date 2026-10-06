import { ALL_FORMATS, AudioBufferSink, BlobSource, CanvasSink, Input } from "mediabunny";
import { expect, it } from "vitest";
import { VideoExporter } from "@/lib/exporter/videoExporter";
import { createRecorderHandle } from "./recorderHandle";

async function measureSync(blob: Blob) {
	const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
	try {
		const video = await input.getPrimaryVideoTrack();
		const audio = await input.getPrimaryAudioTrack();
		expect(video).not.toBeNull();
		expect(audio).not.toBeNull();
		const flashes: number[] = [];
		let white = false;
		for await (const frame of new CanvasSink(video!).canvases()) {
			const context = frame.canvas.getContext("2d") as CanvasRenderingContext2D;
			const pixels = context.getImageData(0, 0, frame.canvas.width, frame.canvas.height).data;
			const next = pixels.some((value, index) => index % 4 === 0 && value > 150);
			if (next && !white) flashes.push(frame.timestamp);
			white = next;
		}
		const tones: number[] = [];
		let lastTone = -1;
		for await (const frame of new AudioBufferSink(audio!).buffers()) {
			const samples = frame.buffer.getChannelData(0);
			for (let index = 0; index < samples.length; index++) {
				const time = frame.timestamp + index / frame.buffer.sampleRate;
				if (Math.abs(samples[index]) > 0.2) {
					if (time - lastTone > 0.12) tones.push(time);
					lastTone = time;
				}
			}
		}
		expect(flashes.length).toBeGreaterThanOrEqual(3);
		expect(tones.length).toBe(flashes.length);
		const errors = flashes.map((flash, index) => Math.abs(flash - tones[index]));
		console.log("SYNC_MEASUREMENT", { flashes, tones, maximumErrorMs: Math.max(...errors) * 1000 });
		expect(Math.max(...errors)).toBeLessThan(0.08);
		return { flashes, tones };
	} finally {
		input.dispose();
	}
}

it("keeps encoded camera flashes and microphone tones synchronized through repeated pauses and MP4 export", async () => {
	const audio = new AudioContext({ sampleRate: 48000 });
	await audio.resume();
	const destination = audio.createMediaStreamDestination();
	const oscillator = audio.createOscillator();
	const gain = audio.createGain();
	oscillator.type = "square";
	oscillator.frequency.value = 1000;
	oscillator.connect(gain);
	gain.connect(destination);
	gain.gain.value = 0;
	const canvas = document.createElement("canvas");
	canvas.width = 160;
	canvas.height = 120;
	const context = canvas.getContext("2d")!;
	const screen = document.createElement("canvas");
	screen.width = 160;
	screen.height = 120;
	const screenContext = screen.getContext("2d")!;
	screenContext.fillStyle = "#111111";
	screenContext.fillRect(0, 0, 160, 120);
	const screenStream = screen.captureStream(30);
	const screenHandle = createRecorderHandle(screenStream, { mimeType: "video/webm;codecs=h264" });
	await new Promise((resolve) => setTimeout(resolve, 100));
	const camera = canvas.captureStream(30);
	const stream = new MediaStream([
		...camera.getVideoTracks(),
		...destination.stream.getAudioTracks(),
	]);
	const start = audio.currentTime;
	for (let pulse = 0.35; pulse < 6; pulse += 0.7) {
		gain.gain.setValueAtTime(0.4, start + pulse);
		gain.gain.setValueAtTime(0, start + pulse + 0.16);
	}
	oscillator.start();
	let animation = 0;
	const draw = () => {
		const elapsed = audio.currentTime - start;
		const phase = (elapsed - 0.35) % 0.7;
		context.fillStyle = elapsed >= 0.35 && phase >= 0 && phase < 0.16 ? "#ffffff" : "#000000";
		context.fillRect(0, 0, canvas.width, canvas.height);
		screenContext.fillRect(0, 0, 160, 120);
		animation = requestAnimationFrame(draw);
	};
	draw();
	const handle = createRecorderHandle(stream, {
		mimeType: "video/webm;codecs=h264,opus",
		audioBitsPerSecond: 128000,
	});
	const wait = (milliseconds: number) =>
		new Promise((resolve) => setTimeout(resolve, milliseconds));
	let url = "";
	let screenUrl = "";
	try {
		await wait(1370);
		handle.recorder.pause();
		screenHandle.recorder.pause();
		await wait(660);
		handle.recorder.resume();
		screenHandle.recorder.resume();
		await wait(1560);
		handle.recorder.pause();
		screenHandle.recorder.pause();
		await wait(600);
		handle.recorder.resume();
		screenHandle.recorder.resume();
		await wait(1810);
		handle.recorder.stop();
		screenHandle.recorder.stop();
		const blob = await handle.recordedBlobPromise;
		const recorded = await measureSync(blob);
		url = URL.createObjectURL(blob);
		screenUrl = URL.createObjectURL(await screenHandle.recordedBlobPromise);
		const exporter = new VideoExporter({
			videoUrl: screenUrl,
			webcamVideoUrl: url,
			microphoneAudioUrl: url,
			webcamOffsetMs: 100,
			microphoneOffsetMs: 100,
			width: 160,
			height: 120,
			frameRate: 30,
			bitrate: 1_000_000,
			wallpaper: "#000000",
			zoomRegions: [],
			cropRegion: { x: 0, y: 0, width: 1, height: 1 },
			webcamLayoutPreset: "picture-in-picture",
			webcamSizePreset: 100,
			showShadow: false,
			shadowIntensity: 0,
			showBlur: false,
			padding: 0,
		});
		const exported = await exporter.export();
		expect(exported.success, exported.error).toBe(true);
		const result = await measureSync(exported.blob!);
		expect(result.tones.length).toBe(recorded.tones.length);
		for (let index = 0; index < recorded.tones.length; index++) {
			expect(Math.abs(result.tones[index] - recorded.tones[index] - 0.1)).toBeLessThan(0.005);
		}
	} finally {
		if (handle.recorder.state !== "inactive") handle.recorder.stop();
		if (screenHandle.recorder.state !== "inactive") screenHandle.recorder.stop();
		cancelAnimationFrame(animation);
		stream.getTracks().forEach((track) => track.stop());
		screenStream.getTracks().forEach((track) => track.stop());
		oscillator.stop();
		await audio.close();
		if (url) URL.revokeObjectURL(url);
		if (screenUrl) URL.revokeObjectURL(screenUrl);
	}
});
