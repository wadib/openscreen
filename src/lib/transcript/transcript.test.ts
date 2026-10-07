import { describe, expect, it } from "vitest";
import {
	buildTranscriptPhrases,
	mergePhrasesForWidth,
	normalizeTranscript,
	transcriptFromSeconds,
	visiblePhrases,
} from "./transcript";

const word = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });

describe("normalizeTranscript", () => {
	it("keeps valid words, sorted and rounded, and drops junk", () => {
		const transcript = normalizeTranscript({
			source: "crisperwhisper",
			words: [
				word("world", 600.4, 900.6),
				word("hello", 100, 500),
				{ text: "", startMs: 1, endMs: 2 },
				{ text: "bad", startMs: Number.NaN, endMs: 2 },
				"nonsense",
			],
		});
		expect(transcript).toEqual({
			source: "crisperwhisper",
			words: [word("hello", 100, 500), word("world", 600, 901)],
		});
	});

	it("returns null for missing or empty transcripts", () => {
		expect(normalizeTranscript(undefined)).toBeNull();
		expect(normalizeTranscript({ words: [] })).toBeNull();
	});
});

it("converts second-based words and applies the microphone offset", () => {
	expect(
		transcriptFromSeconds([{ text: "hi", startSec: 1, endSec: 1.25 }], "whisper", 200)?.words,
	).toEqual([word("hi", 1200, 1450)]);
});

describe("buildTranscriptPhrases", () => {
	it("splits on pauses, sentence ends and long runs", () => {
		const words = [
			word("So", 0, 100),
			word("first.", 120, 300),
			word("Then", 320, 400),
			word("we", 420, 500),
			word("wait", 1000, 1200),
		];
		expect(buildTranscriptPhrases(words).map((phrase) => phrase.text)).toEqual([
			"So first.",
			"Then we",
			"wait",
		]);
		const long = Array.from({ length: 23 }, (_, index) =>
			word(`w${index}`, index * 100, index * 100 + 90),
		);
		expect(buildTranscriptPhrases(long).map((phrase) => phrase.text.split(" ").length)).toEqual([
			10, 10, 3,
		]);
	});

	it("separates speech inside trimmed sections and marks it as cut", () => {
		const words = [word("keep", 0, 200), word("[UH]", 250, 400), word("this", 450, 600)];
		const phrases = buildTranscriptPhrases(words, [{ startMs: 220, endMs: 430 }]);
		expect(phrases).toEqual([
			{ startMs: 0, endMs: 200, text: "keep", cut: false },
			{ startMs: 250, endMs: 400, text: "[UH]", cut: true },
			{ startMs: 450, endMs: 600, text: "this", cut: false },
		]);
	});
});

it("returns only phrases in the visible range", () => {
	const phrases = buildTranscriptPhrases([
		word("a.", 0, 100),
		word("b.", 5000, 5100),
		word("c.", 9000, 9100),
	]);
	expect(visiblePhrases(phrases, 4000, 6000).map((phrase) => phrase.text)).toEqual(["b."]);
});

it("merges short phrases when zoomed out, keeping cut speech separate", () => {
	const phrases = [
		{ startMs: 0, endMs: 500, text: "one", cut: false },
		{ startMs: 600, endMs: 900, text: "two", cut: false },
		{ startMs: 1000, endMs: 1200, text: "[UH]", cut: true },
		{ startMs: 1300, endMs: 1600, text: "three", cut: false },
		{ startMs: 1700, endMs: 4000, text: "four", cut: false },
	];
	expect(mergePhrasesForWidth(phrases, 800)).toEqual([
		{ startMs: 0, endMs: 900, text: "one two", cut: false },
		{ startMs: 1000, endMs: 1200, text: "[UH]", cut: true },
		{ startMs: 1300, endMs: 4000, text: "three four", cut: false },
	]);
	expect(mergePhrasesForWidth(phrases, 0)).toHaveLength(5);
});
