import { normalizeRecordedBlurs, type RecordedBlur } from "./liveBlur";

export interface ProjectMedia {
	screenVideoPath: string;
	webcamVideoPath?: string;
	webcamOffsetMs?: number;
	microphoneAudioPath?: string;
	microphoneOffsetMs?: number;
	microphoneGain?: number;
	microphoneMuted?: boolean;
	cursorCaptureMode?: CursorCaptureMode;
}

export type CursorCaptureMode = "editable-overlay" | "system" | "hidden";

export interface RecordingSession extends ProjectMedia {
	createdAt: number;
	recordedBlurs?: RecordedBlur[];
}

export interface RecordedVideoAssetInput {
	fileName: string;
	videoData: ArrayBuffer;
}

export interface StoreRecordedSessionInput {
	screen: RecordedVideoAssetInput;
	webcam?: RecordedVideoAssetInput;
	webcamOffsetMs?: number;
	microphone?: RecordedVideoAssetInput;
	microphoneOffsetMs?: number;
	microphoneGain?: number;
	createdAt?: number;
	cursorCaptureMode?: CursorCaptureMode;
	/**
	 * Recording wall-clock duration (ms). The main process patches the WebM Duration
	 * header on streamed recordings (the renderer no longer holds the bytes). Browser
	 * MediaRecorder writes no/zero duration, which breaks the editor seek bar and
	 * timeline for anything that took the streaming path.
	 */
	durationMs?: number;
}

export function mergeRecordingSession(
	base: RecordingSession | null,
	update: RecordingSession,
): RecordingSession {
	return {
		...(base ?? {}),
		...update,
		...(update.recordedBlurs === undefined && base?.recordedBlurs
			? { recordedBlurs: base.recordedBlurs }
			: {}),
	};
}

export function normalizeCursorCaptureMode(value: unknown): CursorCaptureMode | undefined {
	return value === "editable-overlay" || value === "system" || value === "hidden"
		? value
		: undefined;
}

function normalizePath(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

export function normalizeProjectMedia(candidate: unknown): ProjectMedia | null {
	if (!candidate || typeof candidate !== "object") {
		return null;
	}

	const raw = candidate as Partial<ProjectMedia>;
	const screenVideoPath = normalizePath(raw.screenVideoPath);

	if (!screenVideoPath) {
		return null;
	}

	const webcamVideoPath = normalizePath(raw.webcamVideoPath);
	const microphoneAudioPath = normalizePath(raw.microphoneAudioPath);
	const webcamOffsetMs =
		typeof raw.webcamOffsetMs === "number" && Number.isFinite(raw.webcamOffsetMs)
			? Math.max(-30_000, Math.min(30_000, Math.round(raw.webcamOffsetMs)))
			: undefined;
	const cursorCaptureMode = normalizeCursorCaptureMode(raw.cursorCaptureMode);
	const microphoneOffsetMs =
		typeof raw.microphoneOffsetMs === "number" && Number.isFinite(raw.microphoneOffsetMs)
			? Math.max(-30_000, Math.min(30_000, Math.round(raw.microphoneOffsetMs)))
			: undefined;
	const microphoneGain =
		typeof raw.microphoneGain === "number" && Number.isFinite(raw.microphoneGain)
			? Math.max(0, Math.min(2, raw.microphoneGain))
			: undefined;

	return {
		screenVideoPath,
		...(webcamVideoPath ? { webcamVideoPath } : {}),
		...(webcamOffsetMs !== undefined ? { webcamOffsetMs } : {}),
		...(microphoneAudioPath ? { microphoneAudioPath } : {}),
		...(microphoneOffsetMs !== undefined ? { microphoneOffsetMs } : {}),
		...(microphoneGain !== undefined ? { microphoneGain } : {}),
		...(typeof raw.microphoneMuted === "boolean" ? { microphoneMuted: raw.microphoneMuted } : {}),
		...(cursorCaptureMode ? { cursorCaptureMode } : {}),
	};
}

export function normalizeRecordingSession(candidate: unknown): RecordingSession | null {
	if (!candidate || typeof candidate !== "object") {
		return null;
	}

	const raw = candidate as Partial<RecordingSession>;
	const media = normalizeProjectMedia(raw);
	if (!media) {
		return null;
	}

	return {
		...media,
		...(Array.isArray((candidate as RecordingSession).recordedBlurs)
			? { recordedBlurs: normalizeRecordedBlurs((candidate as RecordingSession).recordedBlurs) }
			: {}),
		createdAt:
			typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
				? raw.createdAt
				: Date.now(),
	};
}
