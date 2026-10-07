/**
 * Speech cleanup: find long pauses and filler words ("um", "uh", "em") and turn them into
 * trim spans. Pure functions; times are milliseconds on the source (screen video) timeline.
 */

export interface TimeSpan {
	startMs: number;
	endMs: number;
}

export interface CleanupSpan extends TimeSpan {
	reason: "pause" | "filler";
}

export interface TimedWord {
	startSec: number;
	endSec: number;
	text: string;
}

export interface PauseDetectionOptions {
	/** Silences at least this long are shortened. */
	minPauseMs?: number;
	/** Silence kept on each side of a shortened pause, so speech keeps a natural rhythm. */
	keepMs?: number;
	/** Analysis window. */
	windowMs?: number;
}

export const DEFAULT_MIN_PAUSE_MS = 800;
export const DEFAULT_KEEP_PAUSE_MS = 150;
const DEFAULT_WINDOW_MS = 20;
/** Cuts closer than this are merged into one. */
const MERGE_GAP_MS = 100;
/** Shorter cuts are not worth a visible jump. */
const MIN_CUT_MS = 120;
/** Padding around a filler word, never reaching into the neighbouring words. */
const FILLER_PAD_MS = 40;

function percentile(sorted: number[], fraction: number): number {
	if (!sorted.length) return 0;
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.round(fraction * (sorted.length - 1))),
	);
	return sorted[index];
}

/**
 * Level (dBFS) per analysis window and the silence threshold chosen for this recording.
 * The threshold adapts to the noise floor: some microphones never drop below -45 dB.
 */
export function analyseLevels(
	samples: Float32Array,
	sampleRate: number,
	windowMs = DEFAULT_WINDOW_MS,
): { levelsDb: Float32Array; thresholdDb: number; windowMs: number } {
	const windowSize = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
	const count = Math.floor(samples.length / windowSize);
	const levelsDb = new Float32Array(count);
	for (let window = 0; window < count; window++) {
		let sum = 0;
		const offset = window * windowSize;
		for (let index = 0; index < windowSize; index++) {
			const value = samples[offset + index];
			sum += value * value;
		}
		levelsDb[window] = 10 * Math.log10(sum / windowSize + 1e-12);
	}
	const sorted = Array.from(levelsDb).sort((a, b) => a - b);
	const floor = percentile(sorted, 0.1);
	const speech = percentile(sorted, 0.9);
	const thresholdDb = floor + Math.max(6, (speech - floor) * 0.3);
	return { levelsDb, thresholdDb, windowMs };
}

/** Long silences, shortened to `keepMs` on each side. */
export function detectPauses(
	samples: Float32Array,
	sampleRate: number,
	options: PauseDetectionOptions = {},
): CleanupSpan[] {
	const minPauseMs = options.minPauseMs ?? DEFAULT_MIN_PAUSE_MS;
	const keepMs = options.keepMs ?? DEFAULT_KEEP_PAUSE_MS;
	const { levelsDb, thresholdDb, windowMs } = analyseLevels(
		samples,
		sampleRate,
		options.windowMs ?? DEFAULT_WINDOW_MS,
	);
	const spans: CleanupSpan[] = [];
	let runStart = -1;
	const close = (endWindow: number) => {
		if (runStart < 0) return;
		const startMs = runStart * windowMs;
		const endMs = endWindow * windowMs;
		if (endMs - startMs >= minPauseMs) {
			const cut = { startMs: startMs + keepMs, endMs: endMs - keepMs };
			if (cut.endMs - cut.startMs >= MIN_CUT_MS) spans.push({ ...cut, reason: "pause" });
		}
		runStart = -1;
	};
	for (let window = 0; window < levelsDb.length; window++) {
		if (levelsDb[window] < thresholdDb) {
			if (runStart < 0) runStart = window;
		} else {
			close(window);
		}
	}
	close(levelsDb.length);
	return spans;
}

const FILLER_WORDS = new Set([
	"um",
	"umm",
	"uhm",
	"uh",
	"uhh",
	"er",
	"erm",
	"em",
	"emm",
	"hmm",
	"hm",
	"mm",
	"mhm",
	"ah",
	"ahh",
	"eh",
]);

/** Normalise a transcript token: "Um," / "[UM]" / " uh..." → "um" / "uh". */
export function normaliseWord(text: string): string {
	return text
		.toLowerCase()
		.replace(/[[\]().,!?;:"'…-]/g, "")
		.trim();
}

export function isFillerWord(text: string): boolean {
	return FILLER_WORDS.has(normaliseWord(text));
}

/** Filler words as cuts, padded slightly without touching the words around them. */
export function detectFillers(words: TimedWord[]): CleanupSpan[] {
	const sorted = [...words].sort((a, b) => a.startSec - b.startSec);
	const spans: CleanupSpan[] = [];
	for (let index = 0; index < sorted.length; index++) {
		const word = sorted[index];
		if (!isFillerWord(word.text)) continue;
		const previousEnd = index > 0 ? sorted[index - 1].endSec * 1000 : -Infinity;
		const nextStart = index + 1 < sorted.length ? sorted[index + 1].startSec * 1000 : Infinity;
		const startMs = Math.max(previousEnd, word.startSec * 1000 - FILLER_PAD_MS, 0);
		const endMs = Math.min(nextStart, word.endSec * 1000 + FILLER_PAD_MS);
		if (endMs > startMs) spans.push({ startMs, endMs, reason: "filler" });
	}
	return spans;
}

/** Shift spans from the microphone timeline to the screen timeline (positive offset delays the mic). */
export function shiftSpans<T extends TimeSpan>(spans: T[], offsetMs: number): T[] {
	return spans.map((span) => ({
		...span,
		startMs: span.startMs + offsetMs,
		endMs: span.endMs + offsetMs,
	}));
}

/**
 * Merge cleanup spans into trims: clamp to the timeline, merge near neighbours, remove what
 * existing trims already cover, and drop slivers. Returns new spans only, sorted.
 */
export function buildCleanupTrims(
	spans: TimeSpan[],
	existingTrims: TimeSpan[],
	durationMs: number,
): TimeSpan[] {
	const clamped = spans
		.map((span) => ({
			startMs: Math.max(0, Math.min(durationMs, span.startMs)),
			endMs: Math.max(0, Math.min(durationMs, span.endMs)),
		}))
		.filter((span) => span.endMs > span.startMs)
		.sort((a, b) => a.startMs - b.startMs);

	const merged: TimeSpan[] = [];
	for (const span of clamped) {
		const last = merged[merged.length - 1];
		if (last && span.startMs - last.endMs <= MERGE_GAP_MS) {
			last.endMs = Math.max(last.endMs, span.endMs);
		} else {
			merged.push({ ...span });
		}
	}

	const covered = [...existingTrims].sort((a, b) => a.startMs - b.startMs);
	const result: TimeSpan[] = [];
	for (const span of merged) {
		let pieces: TimeSpan[] = [span];
		for (const trim of covered) {
			pieces = pieces.flatMap((piece) => {
				if (trim.endMs <= piece.startMs || trim.startMs >= piece.endMs) return [piece];
				const parts: TimeSpan[] = [];
				if (trim.startMs > piece.startMs)
					parts.push({ startMs: piece.startMs, endMs: trim.startMs });
				if (trim.endMs < piece.endMs) parts.push({ startMs: trim.endMs, endMs: piece.endMs });
				return parts;
			});
		}
		for (const piece of pieces) {
			if (piece.endMs - piece.startMs >= MIN_CUT_MS) {
				result.push({ startMs: Math.round(piece.startMs), endMs: Math.round(piece.endMs) });
			}
		}
	}
	return result;
}

export function totalDurationMs(spans: TimeSpan[]): number {
	return spans.reduce((sum, span) => sum + span.endMs - span.startMs, 0);
}

/** 16-bit PCM mono WAV, for the CrisperWhisper server. */
export function encodeWav16(samples: Float32Array, sampleRate: number): ArrayBuffer {
	const buffer = new ArrayBuffer(44 + samples.length * 2);
	const view = new DataView(buffer);
	const writeText = (offset: number, text: string) => {
		for (let index = 0; index < text.length; index++)
			view.setUint8(offset + index, text.charCodeAt(index));
	};
	writeText(0, "RIFF");
	view.setUint32(4, 36 + samples.length * 2, true);
	writeText(8, "WAVE");
	writeText(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeText(36, "data");
	view.setUint32(40, samples.length * 2, true);
	for (let index = 0; index < samples.length; index++) {
		const value = Math.max(-1, Math.min(1, samples[index]));
		view.setInt16(44 + index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
	}
	return buffer;
}

/**
 * True when something answers at the CrisperWhisper URL. The server only implements POST, so
 * any HTTP response (including 501 for GET) means it is up; a network error means it is not.
 */
export async function isCrisperWhisperReachable(
	url: string,
	timeoutMs = 3000,
	fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
	try {
		await fetchImpl(url, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
		return true;
	} catch {
		return false;
	}
}

/**
 * Transcribe with a CrisperWhisper server (verbatim, keeps fillers as [UH]/[UM]).
 * Expects `POST <url>` with WAV bytes → `{ words: [{ word, start, end }] }`.
 */
export async function transcribeWithCrisperWhisper(
	url: string,
	samples16k: Float32Array,
	signal?: AbortSignal,
): Promise<TimedWord[]> {
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "audio/wav" },
		body: encodeWav16(samples16k, 16_000),
		signal,
	});
	if (!response.ok) throw new Error(`CrisperWhisper server returned ${response.status}`);
	const body = (await response.json()) as {
		words?: Array<{ word?: unknown; start?: unknown; end?: unknown }>;
		error?: string;
	};
	if (body.error) throw new Error(body.error);
	return (body.words ?? [])
		.filter(
			(word) =>
				typeof word.word === "string" &&
				typeof word.start === "number" &&
				typeof word.end === "number",
		)
		.map((word) => ({
			text: word.word as string,
			startSec: word.start as number,
			endSec: word.end as number,
		}));
}
