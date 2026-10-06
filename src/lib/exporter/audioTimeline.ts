import type { TrimRegion } from "@/components/video-editor/types";

export async function renderAudioTimeline(
	system: AudioBuffer | null,
	microphone: AudioBuffer | null,
	options: {
		durationSec: number;
		sampleRate: number;
		channels: number;
		trimRegions: TrimRegion[];
		microphoneOffsetMs: number;
		microphoneGain: number;
		microphoneMuted: boolean;
	},
): Promise<AudioBuffer | null> {
	const segments: Array<{ start: number; end: number }> = [];
	let position = 0;
	for (const region of [...options.trimRegions].sort((a, b) => a.startMs - b.startMs)) {
		const start = Math.max(0, Math.min(options.durationSec, region.startMs / 1000));
		const end = Math.max(start, Math.min(options.durationSec, region.endMs / 1000));
		if (start > position) segments.push({ start: position, end: start });
		position = Math.max(position, end);
	}
	if (position < options.durationSec) segments.push({ start: position, end: options.durationSec });
	const frames = Math.round(
		segments.reduce((sum, segment) => sum + segment.end - segment.start, 0) * options.sampleRate,
	);
	if (frames <= 0) return null;
	const context = new OfflineAudioContext(options.channels, frames, options.sampleRate);
	const schedule = (buffer: AudioBuffer | null, offset: number, gain: number) => {
		if (!buffer || gain === 0) return;
		const level = context.createGain();
		level.gain.value = gain;
		level.connect(context.destination);
		let outputPosition = 0;
		for (const segment of segments) {
			const start = Math.max(segment.start, offset);
			const end = Math.min(segment.end, offset + buffer.duration);
			if (end > start) {
				const source = context.createBufferSource();
				source.buffer = buffer;
				source.connect(level);
				source.start(outputPosition + start - segment.start, start - offset, end - start);
			}
			outputPosition += segment.end - segment.start;
		}
	};
	schedule(system, 0, 1);
	schedule(
		microphone,
		options.microphoneOffsetMs / 1000,
		options.microphoneMuted ? 0 : Math.max(0, Math.min(2, options.microphoneGain)),
	);
	return context.startRendering();
}
