import type { TrimRegion } from "@/components/video-editor/types";

const CURVE_POINTS = 64;

/** Equal-power fade curve (constant loudness through a crossfade). */
function fadeCurve(direction: "in" | "out"): Float32Array {
	const curve = new Float32Array(CURVE_POINTS);
	for (let index = 0; index < CURVE_POINTS; index++) {
		const phase = (index / (CURVE_POINTS - 1)) * (Math.PI / 2);
		curve[index] = direction === "in" ? Math.sin(phase) : Math.cos(phase);
	}
	return curve;
}

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
		/**
		 * Crossfade length at each trim cut. The audio before a cut keeps playing (fading out)
		 * while the audio after it fades in, so the output length is unchanged.
		 */
		crossfadeSec?: number;
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
	const crossfade = Math.max(0, options.crossfadeSec ?? 0);
	const fadeIn = fadeCurve("in");
	const fadeOut = fadeCurve("out");
	const schedule = (buffer: AudioBuffer | null, offset: number, gain: number) => {
		if (!buffer || gain === 0) return;
		const level = context.createGain();
		level.gain.value = gain;
		level.connect(context.destination);
		let outputPosition = 0;
		segments.forEach((segment, index) => {
			const length = segment.end - segment.start;
			// Never longer than half a segment, so fades of neighbouring cuts cannot overlap.
			const fade = Math.min(crossfade, length / 2);
			const fadesIn = fade > 0 && index > 0;
			const fadesOut = fade > 0 && index < segments.length - 1;
			const tail = fadesOut ? fade : 0;
			const start = Math.max(segment.start, offset);
			const end = Math.min(segment.end + tail, offset + buffer.duration);
			if (end > start) {
				const source = context.createBufferSource();
				source.buffer = buffer;
				const when = outputPosition + start - segment.start;
				let destination: AudioNode = level;
				if (fadesIn || fadesOut) {
					const envelope = context.createGain();
					envelope.connect(level);
					destination = envelope;
					if (fadesIn) envelope.gain.setValueCurveAtTime(fadeIn, outputPosition, fade);
					if (fadesOut) envelope.gain.setValueCurveAtTime(fadeOut, outputPosition + length, fade);
				}
				source.connect(destination);
				source.start(when, start - offset, end - start);
			}
			outputPosition += length;
		});
	};
	schedule(system, 0, 1);
	schedule(
		microphone,
		options.microphoneOffsetMs / 1000,
		options.microphoneMuted ? 0 : Math.max(0, Math.min(2, options.microphoneGain)),
	);
	return context.startRendering();
}
