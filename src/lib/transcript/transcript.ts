/**
 * Project transcript: timed words on the source (screen) timeline, shown as a lane under the
 * zoom track so zooms can be placed and checked against what is being said without playing
 * the audio. Words are stored with the project; phrases are derived for display.
 */

export interface TranscriptWord {
	text: string;
	startMs: number;
	endMs: number;
}

export interface ProjectTranscript {
	/** Where the words came from, e.g. "crisperwhisper", "whisper", "import". */
	source: string;
	words: TranscriptWord[];
}

export interface TranscriptPhrase {
	startMs: number;
	endMs: number;
	text: string;
	/** Every word of the phrase lies in a trimmed (cut) section. */
	cut: boolean;
}

interface Span {
	startMs: number;
	endMs: number;
}

const MAX_WORDS = 200_000;
/** A pause at least this long starts a new phrase. */
const PHRASE_GAP_MS = 400;
const MAX_PHRASE_WORDS = 10;
const SENTENCE_END = /[.!?…]["')\]]?$/;

export function normalizeTranscript(value: unknown): ProjectTranscript | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as { source?: unknown; words?: unknown };
	if (!Array.isArray(raw.words)) return null;
	const words: TranscriptWord[] = [];
	for (const item of raw.words.slice(0, MAX_WORDS)) {
		if (!item || typeof item !== "object") continue;
		const word = item as Partial<TranscriptWord>;
		const text = typeof word.text === "string" ? word.text.trim() : "";
		if (
			!text ||
			typeof word.startMs !== "number" ||
			typeof word.endMs !== "number" ||
			!Number.isFinite(word.startMs) ||
			!Number.isFinite(word.endMs)
		) {
			continue;
		}
		const startMs = Math.max(0, Math.round(word.startMs));
		words.push({ text, startMs, endMs: Math.max(startMs, Math.round(word.endMs)) });
	}
	if (!words.length) return null;
	words.sort((a, b) => a.startMs - b.startMs);
	return {
		source: typeof raw.source === "string" && raw.source ? raw.source : "unknown",
		words,
	};
}

/** Words from seconds-based results (Whisper / CrisperWhisper), shifted onto the screen timeline. */
export function transcriptFromSeconds(
	words: Array<{ text: string; startSec: number; endSec: number }>,
	source: string,
	offsetMs = 0,
): ProjectTranscript | null {
	return normalizeTranscript({
		source,
		words: words.map((word) => ({
			text: word.text,
			startMs: word.startSec * 1000 + offsetMs,
			endMs: word.endSec * 1000 + offsetMs,
		})),
	});
}

function isCut(word: TranscriptWord, trims: readonly Span[]): boolean {
	const middle = (word.startMs + word.endMs) / 2;
	return trims.some((trim) => middle >= trim.startMs && middle <= trim.endMs);
}

/**
 * Group words into short readable phrases: a new phrase starts after a pause, after the end
 * of a sentence, after MAX_PHRASE_WORDS words, and wherever the words cross into or out of
 * a trimmed section (so cut speech is shown separately).
 */
export function buildTranscriptPhrases(
	words: readonly TranscriptWord[],
	trims: readonly Span[] = [],
): TranscriptPhrase[] {
	const phrases: TranscriptPhrase[] = [];
	let current: { words: TranscriptWord[]; cut: boolean } | null = null;
	const flush = () => {
		if (!current?.words.length) return;
		phrases.push({
			startMs: current.words[0].startMs,
			endMs: current.words[current.words.length - 1].endMs,
			text: current.words.map((word) => word.text).join(" "),
			cut: current.cut,
		});
		current = null;
	};
	for (const word of words) {
		const cut = isCut(word, trims);
		if (current) {
			const last = current.words[current.words.length - 1];
			const breakHere =
				current.cut !== cut ||
				word.startMs - last.endMs >= PHRASE_GAP_MS ||
				SENTENCE_END.test(last.text) ||
				current.words.length >= MAX_PHRASE_WORDS;
			if (breakHere) flush();
		}
		if (!current) current = { words: [], cut };
		current.words.push(word);
	}
	flush();
	return phrases;
}

/** Phrases overlapping the visible range, for rendering. */
export function visiblePhrases(
	phrases: readonly TranscriptPhrase[],
	rangeStartMs: number,
	rangeEndMs: number,
): TranscriptPhrase[] {
	return phrases.filter((phrase) => phrase.endMs >= rangeStartMs && phrase.startMs <= rangeEndMs);
}

/**
 * Merge neighbouring phrases until each is at least `minWidthMs` long, so text stays readable
 * when the timeline is zoomed out. Cut and kept speech are never merged together.
 */
export function mergePhrasesForWidth(
	phrases: readonly TranscriptPhrase[],
	minWidthMs: number,
): TranscriptPhrase[] {
	const merged: TranscriptPhrase[] = [];
	for (const phrase of phrases) {
		const last = merged[merged.length - 1];
		if (last && last.cut === phrase.cut && last.endMs - last.startMs < minWidthMs) {
			last.endMs = phrase.endMs;
			last.text = `${last.text} ${phrase.text}`;
		} else {
			merged.push({ ...phrase });
		}
	}
	return merged;
}
