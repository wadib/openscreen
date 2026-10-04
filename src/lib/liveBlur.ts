import {
	type AnnotationRegion,
	type BlurData,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_BLUR_DATA,
	MAX_BLUR_BLOCK_SIZE,
	MAX_BLUR_INTENSITY,
	MIN_BLUR_BLOCK_SIZE,
	MIN_BLUR_INTENSITY,
} from "../components/video-editor/types";

export interface LiveBlurArea {
	id: string;
	position: { x: number; y: number };
	size: { width: number; height: number };
	blurData: BlurData;
}

export interface RecordedBlur extends LiveBlurArea {
	zIndex?: number;
	startMs: number;
	endMs: number;
}

export interface LiveBlurState {
	controlsOpen?: boolean;
	areas: LiveBlurArea[];
	recording: boolean;
	paused: boolean;
	sourceId?: string;
}

const bounded = (value: unknown, fallback: number, min: number, max: number) =>
	typeof value === "number" && Number.isFinite(value)
		? Math.max(min, Math.min(max, value))
		: Math.max(min, Math.min(max, fallback));

export function normalizeLiveBlurAreas(value: unknown): LiveBlurArea[] {
	if (!Array.isArray(value)) return [];
	const ids = new Set<string>();
	return value.slice(0, 16).flatMap((candidate) => {
		if (!candidate || typeof candidate !== "object") return [];
		const area = candidate as Partial<LiveBlurArea>;
		if (typeof area.id !== "string" || !area.id || area.id.length > 80 || ids.has(area.id))
			return [];
		ids.add(area.id);
		const x = bounded(area.position?.x, 0, 0, 99);
		const y = bounded(area.position?.y, 0, 0, 99);
		return [
			{
				id: area.id,
				position: { x, y },
				size: {
					width: bounded(area.size?.width, 30, 1, 100 - x),
					height: bounded(area.size?.height, 20, 1, 100 - y),
				},
				blurData: {
					...DEFAULT_BLUR_DATA,
					type: area.blurData?.type === "mosaic" ? ("mosaic" as const) : ("blur" as const),
					shape: area.blurData?.shape === "oval" ? ("oval" as const) : ("rectangle" as const),
					color: area.blurData?.color === "black" ? ("black" as const) : ("white" as const),
					intensity: bounded(area.blurData?.intensity, 12, MIN_BLUR_INTENSITY, MAX_BLUR_INTENSITY),
					blockSize: bounded(
						area.blurData?.blockSize,
						12,
						MIN_BLUR_BLOCK_SIZE,
						MAX_BLUR_BLOCK_SIZE,
					),
					freehandPoints: undefined,
				},
			},
		];
	});
}

export function normalizeRecordedBlurs(value: unknown): RecordedBlur[] {
	if (!Array.isArray(value)) return [];
	return value.slice(0, 100_000).flatMap((candidate) => {
		if (!candidate || typeof candidate !== "object") return [];
		const area = normalizeLiveBlurAreas([candidate])[0];
		const { startMs, endMs } = candidate as Partial<RecordedBlur>;
		if (
			!area ||
			typeof startMs !== "number" ||
			typeof endMs !== "number" ||
			!Number.isFinite(startMs) ||
			!Number.isFinite(endMs) ||
			startMs < 0 ||
			endMs <= startMs
		)
			return [];
		return [
			{
				...area,
				startMs,
				endMs,
				zIndex: bounded((candidate as RecordedBlur).zIndex, 1, 1, 100_000),
			},
		];
	});
}

export function recordedBlursToAnnotations(blurs: RecordedBlur[]): AnnotationRegion[] {
	return blurs.map((blur, index) => ({
		...blur,
		id: `live-blur-${blur.id}-${index}`,
		type: "blur",
		annotationSource: "live-blur",
		content: "",
		style: { ...DEFAULT_ANNOTATION_STYLE },
		zIndex: blur.zIndex ?? index + 1,
	}));
}

export interface BlurProjection {
	width: number;
	height: number;
	mask: { x: number; y: number; width: number; height: number };
	crop: { x: number; y: number; width: number; height: number };
	scale: number;
	x: number;
	y: number;
}

export function projectLiveBlur(
	annotation: AnnotationRegion,
	view: BlurProjection,
): AnnotationRegion | null {
	if (annotation.annotationSource !== "live-blur") return annotation;
	const { mask, crop, scale, x, y, width, height } = view;
	if (width <= 0 || height <= 0 || crop.width <= 0 || crop.height <= 0 || scale <= 0) return null;
	const left =
		x + scale * (mask.x + ((annotation.position.x / 100 - crop.x) / crop.width) * mask.width);
	const top =
		y + scale * (mask.y + ((annotation.position.y / 100 - crop.y) / crop.height) * mask.height);
	const right = left + ((scale * annotation.size.width) / 100 / crop.width) * mask.width;
	const bottom = top + ((scale * annotation.size.height) / 100 / crop.height) * mask.height;
	const clippedLeft = Math.max(0, x + scale * mask.x, left);
	const clippedTop = Math.max(0, y + scale * mask.y, top);
	const clippedRight = Math.min(width, x + scale * (mask.x + mask.width), right);
	const clippedBottom = Math.min(height, y + scale * (mask.y + mask.height), bottom);
	if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) return null;
	return {
		...annotation,
		position: { x: (left / width) * 100, y: (top / height) * 100 },
		size: { width: ((right - left) / width) * 100, height: ((bottom - top) / height) * 100 },
		blurClip: {
			x: Math.max(0, x + scale * mask.x),
			y: Math.max(0, y + scale * mask.y),
			width: Math.min(width, x + scale * (mask.x + mask.width)) - Math.max(0, x + scale * mask.x),
			height:
				Math.min(height, y + scale * (mask.y + mask.height)) - Math.max(0, y + scale * mask.y),
		},
	};
}

export function unprojectBlurPosition(position: { x: number; y: number }, view: BlurProjection) {
	return {
		x: bounded(
			((((position.x / 100) * view.width - view.x) / view.scale - view.mask.x) / view.mask.width) *
				view.crop.width *
				100 +
				view.crop.x * 100,
			0,
			0,
			99,
		),
		y: bounded(
			((((position.y / 100) * view.height - view.y) / view.scale - view.mask.y) /
				view.mask.height) *
				view.crop.height *
				100 +
				view.crop.y * 100,
			0,
			0,
			99,
		),
	};
}

export function unprojectBlurSize(size: { width: number; height: number }, view: BlurProjection) {
	return {
		width: bounded(
			(((size.width / 100) * view.width) / view.scale / view.mask.width) * view.crop.width * 100,
			1,
			1,
			100,
		),
		height: bounded(
			(((size.height / 100) * view.height) / view.scale / view.mask.height) *
				view.crop.height *
				100,
			1,
			1,
			100,
		),
	};
}

// Timed snapshots keep live edits removable using the editor's existing blur clips.
export class LiveBlurRecorder {
	private areas: LiveBlurArea[] = [];
	private open = new Map<string, { area: LiveBlurArea; startMs: number; zIndex: number }>();
	private nextZIndex = 1;
	private clips: RecordedBlur[] = [];
	private recordingId?: number;
	private startedAt?: number;
	private accumulated = 0;
	private completed?: { id: number; clips: RecordedBlur[] };
	private sourceId?: string;
	private mediaTime?: number;

	constructor(private now: () => number = Date.now) {}

	get state(): LiveBlurState {
		return structuredClone({
			areas: this.areas,
			recording: this.recordingId !== undefined,
			paused: this.recordingId !== undefined && this.startedAt === undefined,
			sourceId: this.sourceId,
		});
	}

	selectSource(sourceId?: string) {
		if (this.recordingId !== undefined || this.sourceId === sourceId) return;
		this.sourceId = sourceId;
		this.areas = [];
	}

	private time(at = this.now()) {
		if (this.mediaTime !== undefined) return this.mediaTime;
		return Math.max(0, this.accumulated + (this.startedAt === undefined ? 0 : at - this.startedAt));
	}

	setMediaTime(ms: number) {
		if (this.recordingId !== undefined && Number.isFinite(ms) && ms >= 0)
			this.mediaTime = Math.max(this.mediaTime ?? 0, ms);
	}

	start(id: number, at = this.now()) {
		if (this.recordingId === id) return;
		if (this.recordingId !== undefined) throw new Error("A blur recording is already active");
		this.recordingId = id;
		this.mediaTime = undefined;
		this.startedAt = at;
		this.accumulated = 0;
		this.clips = [];
		this.open.clear();
		this.nextZIndex = 1;
		for (const area of this.areas)
			this.open.set(area.id, { area, startMs: 0, zIndex: this.nextZIndex++ });
	}

	pause() {
		if (this.recordingId === undefined || this.startedAt === undefined) return;
		this.accumulated = this.time();
		this.startedAt = undefined;
	}

	resume() {
		if (this.recordingId === undefined || this.startedAt !== undefined) return;
		this.startedAt = this.now();
	}

	update(candidate: unknown) {
		const next = normalizeLiveBlurAreas(candidate);
		if (this.recordingId !== undefined) {
			const timeMs = this.time();
			for (const [id, active] of this.open) {
				const replacement = next.find((area) => area.id === id);
				if (replacement && JSON.stringify(replacement) === JSON.stringify(active.area)) continue;
				if (timeMs > active.startMs)
					this.clips.push({
						...active.area,
						startMs: active.startMs,
						endMs: timeMs,
						zIndex: active.zIndex,
					});
				if (replacement) {
					this.open.set(id, { area: replacement, startMs: timeMs, zIndex: active.zIndex });
					continue;
				}
				this.open.delete(id);
			}
			for (const area of next) {
				if (!this.open.has(area.id))
					this.open.set(area.id, { area, startMs: timeMs, zIndex: this.nextZIndex++ });
			}
		}
		this.areas = next;
	}

	finish(id?: number, at = this.now()): RecordedBlur[] {
		if (id === undefined) id = this.recordingId;
		if (id === undefined) return [];
		if (this.completed?.id === id) return structuredClone(this.completed.clips);
		if (this.recordingId !== id) return [];
		const endMs = this.time(at);
		for (const { area, startMs, zIndex } of this.open.values()) {
			if (endMs > startMs) this.clips.push({ ...area, startMs, endMs, zIndex });
		}
		this.completed = { id, clips: structuredClone(this.clips) };
		this.open.clear();
		this.recordingId = undefined;
		this.startedAt = undefined;
		return structuredClone(this.clips);
	}
}
