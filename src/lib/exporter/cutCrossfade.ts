import type { TrimRegion } from "@/components/video-editor/types";

/** True when output time jumped over a trimmed region between two consecutive frames. */
export function isCutBetween(
	trims: readonly TrimRegion[],
	previousSourceMs: number,
	nextSourceMs: number,
): boolean {
	return trims.some(
		(trim) =>
			trim.startMs > previousSourceMs - 1 &&
			trim.endMs <= nextSourceMs + 1 &&
			trim.endMs > trim.startMs,
	);
}

export function crossfadeFrameCount(crossfadeMs: number, frameRate: number): number {
	return Math.max(0, Math.round((crossfadeMs / 1000) * frameRate));
}

/** Opacity of the outgoing frame for the n-th frame (1-based) of a crossfade of `total` frames. */
export function outgoingOpacity(frameOfFade: number, total: number): number {
	return Math.max(0, 1 - frameOfFade / (total + 1));
}

/**
 * Dissolve at trim cuts: the last frame before a cut fades out over the first frames after
 * it. Uses the held last frame, so the output length (and audio sync) is unchanged.
 */
export class CutCrossfader {
	private last: HTMLCanvasElement;
	private lastCtx: CanvasRenderingContext2D;
	private outgoing: HTMLCanvasElement;
	private outgoingCtx: CanvasRenderingContext2D;
	private output: HTMLCanvasElement;
	private outputCtx: CanvasRenderingContext2D;
	private previousSourceMs: number | null = null;
	private remaining = 0;
	private hasLast = false;

	constructor(
		width: number,
		height: number,
		private readonly trims: readonly TrimRegion[],
		private readonly frames: number,
	) {
		const make = () => {
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d", { willReadFrequently: false });
			if (!ctx) throw new Error("Failed to create crossfade canvas");
			return [canvas, ctx] as const;
		};
		[this.last, this.lastCtx] = make();
		[this.outgoing, this.outgoingCtx] = make();
		[this.output, this.outputCtx] = make();
	}

	/**
	 * Call once per output frame after rendering. Returns the canvas to encode: the rendered
	 * canvas itself, or a blend while a crossfade is running.
	 */
	process(rendered: HTMLCanvasElement, sourceTimestampMs: number): HTMLCanvasElement {
		if (
			this.frames > 0 &&
			this.hasLast &&
			this.previousSourceMs !== null &&
			isCutBetween(this.trims, this.previousSourceMs, sourceTimestampMs)
		) {
			// Freeze the last frame before the cut as the outgoing image.
			[this.outgoing, this.last] = [this.last, this.outgoing];
			[this.outgoingCtx, this.lastCtx] = [this.lastCtx, this.outgoingCtx];
			this.remaining = this.frames;
		}
		this.previousSourceMs = sourceTimestampMs;

		let result = rendered;
		if (this.remaining > 0) {
			const frameOfFade = this.frames - this.remaining + 1;
			this.outputCtx.globalAlpha = 1;
			this.outputCtx.drawImage(rendered, 0, 0);
			this.outputCtx.globalAlpha = outgoingOpacity(frameOfFade, this.frames);
			this.outputCtx.drawImage(this.outgoing, 0, 0);
			this.outputCtx.globalAlpha = 1;
			this.remaining--;
			result = this.output;
		}
		this.lastCtx.drawImage(result, 0, 0);
		this.hasLast = true;
		return result;
	}
}
