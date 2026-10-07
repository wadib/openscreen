import { useTimelineContext } from "dnd-timeline";
import { useMemo } from "react";
import {
	buildTranscriptPhrases,
	mergePhrasesForWidth,
	type TranscriptWord,
	visiblePhrases,
} from "@/lib/transcript/transcript";
import { cn } from "@/lib/utils";
import type { CutSpan } from "./Row";

/** Below this width a phrase is drawn as a plain marker; its text stays in the tooltip. */
const MIN_TEXT_WIDTH_PX = 22;
/** When zoomed out, phrases are merged until each block is at least this wide on screen. */
const MIN_BLOCK_WIDTH_PX = 90;

/**
 * Transcript phrases laid out on the timeline under the zoom lane, so zooms can be checked
 * against what is being said without playing the audio. Clicking a phrase seeks to it.
 * Speech in trimmed sections is shown struck through.
 */
export function TranscriptLane({
	words,
	trims,
	onSeek,
}: {
	words: readonly TranscriptWord[];
	trims: readonly CutSpan[];
	onSeek?: (timeSec: number) => void;
}) {
	const { range, valueToPixels, pixelsToValue } = useTimelineContext();
	const phrases = useMemo(() => buildTranscriptPhrases(words, trims), [words, trims]);
	const minBlockMs = pixelsToValue(MIN_BLOCK_WIDTH_PX);
	const minTextMs = pixelsToValue(MIN_TEXT_WIDTH_PX);
	// Kept speech merges into readable blocks; cut speech (already shaded by the trim bands)
	// appears once it is wide enough to read, so frequent cut fillers don't fragment the text.
	const blocks = useMemo(
		() => [
			...mergePhrasesForWidth(
				phrases.filter((phrase) => !phrase.cut),
				minBlockMs,
			),
			...phrases.filter((phrase) => phrase.cut && phrase.endMs - phrase.startMs >= minTextMs),
		],
		[phrases, minBlockMs, minTextMs],
	);
	const shown = visiblePhrases(blocks, range.start, range.end);

	return (
		<div className="relative h-full min-h-[40px]" data-testid="transcript-lane">
			{shown.map((phrase) => {
				const left = valueToPixels(phrase.startMs - range.start);
				const width = Math.max(3, valueToPixels(phrase.endMs - phrase.startMs));
				return (
					<button
						key={`${phrase.startMs}-${phrase.endMs}`}
						type="button"
						title={phrase.text}
						onPointerDown={(event) => event.stopPropagation()}
						onClick={(event) => {
							event.stopPropagation();
							onSeek?.(phrase.startMs / 1000);
						}}
						className={cn(
							"absolute top-1 bottom-1 overflow-hidden rounded-[4px] border px-1 text-left text-[10.5px] leading-[30px] whitespace-nowrap transition-colors",
							phrase.cut
								? "border-red-400/20 bg-red-500/[0.06] text-white/30 line-through decoration-red-400/50"
								: "border-sky-300/20 bg-sky-400/[0.10] text-white/80 hover:bg-sky-400/20 hover:text-white",
						)}
						style={{ left, width }}
					>
						{width >= MIN_TEXT_WIDTH_PX ? phrase.text : null}
					</button>
				);
			})}
		</div>
	);
}
