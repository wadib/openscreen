import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from "mediabunny";
import { StreamingVideoDecoder } from "@/lib/exporter/streamingDecoder";

async function loadSourceBlob(url: string): Promise<Blob> {
	const source =
		/^(https?:|blob:|data:)/i.test(url) || !window.electronAPI
			? await StreamingVideoDecoder.loadRemoteSourceFile(url)
			: await StreamingVideoDecoder.loadLocalSourceFile(url);
	return source.blob;
}

/**
 * Decode the primary audio track of a media file into one AudioBuffer, placing every packet
 * at its own timestamp. Leading silence and pause gaps are kept, so sample N of the result is
 * source time N / sampleRate — which `decodeAudioData` does not guarantee for WebM.
 * Returns null when the file has no audio track.
 */
export async function decodeAudioTimeline(
	urlOrBlob: string | Blob,
	options: { signal?: AbortSignal; isCancelled?: () => boolean } = {},
): Promise<AudioBuffer | null> {
	const blob = typeof urlOrBlob === "string" ? await loadSourceBlob(urlOrBlob) : urlOrBlob;
	const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
	const stopped = () => options.signal?.aborted || options.isCancelled?.();
	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track) return null;
		let buffer = new AudioBuffer({
			numberOfChannels: track.numberOfChannels,
			sampleRate: track.sampleRate,
			length: Math.max(1, Math.ceil((await track.computeDuration()) * track.sampleRate)),
		});
		for await (const decoded of new AudioBufferSink(track).buffers()) {
			if (stopped()) break;
			const position = Math.round(decoded.timestamp * buffer.sampleRate);
			// WebM duration can omit the final packet's duration. Keep its samples too.
			const requiredLength = position + decoded.buffer.length;
			if (requiredLength > buffer.length) {
				const extended = new AudioBuffer({
					numberOfChannels: buffer.numberOfChannels,
					sampleRate: buffer.sampleRate,
					length: requiredLength,
				});
				for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
					extended.copyToChannel(buffer.getChannelData(channel), channel);
				}
				buffer = extended;
			}
			const skip = Math.max(0, -position);
			const count = Math.min(decoded.buffer.length - skip, buffer.length - Math.max(0, position));
			if (count <= 0) continue;
			for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
				buffer
					.getChannelData(channel)
					.set(
						decoded.buffer.getChannelData(channel).subarray(skip, skip + count),
						Math.max(0, position),
					);
			}
		}
		if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
		return buffer;
	} finally {
		input.dispose();
	}
}

/** Mix to mono and resample, keeping the timeline (sample N = time N / targetRate). */
export async function toMono(buffer: AudioBuffer, targetRate: number): Promise<Float32Array> {
	const length = Math.max(1, Math.round(buffer.duration * targetRate));
	const context = new OfflineAudioContext(1, length, targetRate);
	const source = context.createBufferSource();
	source.buffer = buffer;
	source.connect(context.destination);
	source.start(0);
	const rendered = await context.startRendering();
	return rendered.getChannelData(0);
}
