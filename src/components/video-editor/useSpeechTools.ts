import { type MutableRefObject, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { EditorState } from "@/hooks/useEditorHistory";
import {
	measureSync,
	microphoneOffsetFromMeasurement,
	RELIABLE_SYNC_CONFIDENCE,
} from "@/lib/audio/audioSync";
import { decodeAudioTimeline, toMono } from "@/lib/audio/decodeAudioTimeline";
import { transcribeMono16kToSegments } from "@/lib/captioning/transcribe";
import {
	buildCleanupTrims,
	type CleanupSpan,
	DEFAULT_MIN_PAUSE_MS,
	detectFillers,
	detectPauses,
	isCrisperWhisperReachable,
	shiftSpans,
	totalDurationMs,
	transcribeWithCrisperWhisper,
} from "@/lib/cleanup/speechCleanup";
import { type ProjectTranscript, transcriptFromSeconds } from "@/lib/transcript/transcript";
import type { TrimRegion } from "./types";

const CLEANUP_TOAST_ID = "speech-cleanup-progress";
const SYNC_TOAST_ID = "microphone-sync-progress";
const TRANSCRIPT_TOAST_ID = "transcript-progress";
const SETTINGS_KEY = "openscreen_cleanup_settings";
const SAMPLE_RATE = 16_000;

export type FillerEngine = "off" | "local" | "crisperwhisper";

export interface CleanupSettings {
	pauses: boolean;
	minPauseMs: number;
	fillers: FillerEngine;
	serverUrl: string;
}

export const MIN_PAUSE_CHOICES = [500, 800, 1200, 2000] as const;

/** On the Z13 the server runs locally; elsewhere it is reached by its Tailscale name. */
export function defaultCrisperWhisperUrl(userAgent = navigator.userAgent): string {
	return /Linux/i.test(userAgent) && !/Android/i.test(userAgent)
		? "http://127.0.0.1:8090/"
		: "http://omarchy:8090/";
}

/** Addresses used by earlier versions, before the server moved to its own port (8090). */
const LEGACY_SERVER_URLS = new Set(["http://192.168.86.250:8080/", "http://192.168.86.250:8080"]);

export const DEFAULT_CLEANUP_SETTINGS: CleanupSettings = {
	pauses: true,
	minPauseMs: DEFAULT_MIN_PAUSE_MS,
	fillers: "local",
	serverUrl: defaultCrisperWhisperUrl(),
};

export const CRISPERWHISPER_START_COMMAND = "systemctl --user start crisperwhisper";

export function loadCleanupSettings(): CleanupSettings {
	try {
		const raw = JSON.parse(
			localStorage.getItem(SETTINGS_KEY) ?? "null",
		) as Partial<CleanupSettings> | null;
		if (!raw || typeof raw !== "object") return { ...DEFAULT_CLEANUP_SETTINGS };
		return {
			pauses: typeof raw.pauses === "boolean" ? raw.pauses : DEFAULT_CLEANUP_SETTINGS.pauses,
			minPauseMs: (MIN_PAUSE_CHOICES as readonly number[]).includes(raw.minPauseMs ?? -1)
				? (raw.minPauseMs as number)
				: DEFAULT_CLEANUP_SETTINGS.minPauseMs,
			fillers:
				raw.fillers === "off" || raw.fillers === "local" || raw.fillers === "crisperwhisper"
					? raw.fillers
					: DEFAULT_CLEANUP_SETTINGS.fillers,
			serverUrl:
				typeof raw.serverUrl === "string" &&
				/^https?:\/\//i.test(raw.serverUrl) &&
				!LEGACY_SERVER_URLS.has(raw.serverUrl)
					? raw.serverUrl
					: DEFAULT_CLEANUP_SETTINGS.serverUrl,
		};
	} catch {
		return { ...DEFAULT_CLEANUP_SETTINGS };
	}
}

export function saveCleanupSettings(settings: CleanupSettings): void {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		/* storage unavailable: settings last for this session only */
	}
}

type Translate = (key: string, vars?: Record<string, string>) => string;

async function loadMono16k(url: string): Promise<Float32Array | null> {
	const buffer = await decodeAudioTimeline(url);
	if (!buffer) return null;
	return toMono(buffer, SAMPLE_RATE);
}

function formatSeconds(ms: number): string {
	return (ms / 1000).toFixed(1);
}

export function useSpeechTools(options: {
	videoPath: string | null;
	webcamVideoPath: string | null;
	webcamOffsetMs: number;
	microphoneAudioPath: string | null;
	microphoneMuted: boolean;
	microphoneOffsetMs: number;
	setMicrophoneOffsetMs: (offsetMs: number) => void;
	durationSec: number;
	trimRegions: TrimRegion[];
	pushState: (update: (prev: EditorState) => Partial<EditorState>) => void;
	nextTrimIdRef: MutableRefObject<number>;
	setTranscript?: (transcript: ProjectTranscript) => void;
	t: Translate;
}) {
	const [isCleaningUp, setIsCleaningUp] = useState(false);
	const [isSyncingMicrophone, setIsSyncingMicrophone] = useState(false);
	const [isTranscribing, setIsTranscribing] = useState(false);
	const busy = useRef(false);
	const latest = useRef(options);
	latest.current = options;

	const runCleanup = useCallback(async (settings: CleanupSettings) => {
		const { videoPath, microphoneAudioPath, microphoneMuted, microphoneOffsetMs, t } =
			latest.current;
		if (!videoPath) {
			toast.error(t("errors.noVideoLoaded"));
			return;
		}
		if (busy.current) return;
		busy.current = true;
		setIsCleaningUp(true);
		saveCleanupSettings(settings);
		try {
			// The separate microphone track is cleaner than the screen mix; spans found on it are
			// moved onto the screen timeline by the microphone offset.
			const useMicrophone = Boolean(microphoneAudioPath && !microphoneMuted);
			const sourceUrl = useMicrophone ? (microphoneAudioPath as string) : videoPath;
			const offsetMs = useMicrophone ? microphoneOffsetMs : 0;

			toast.loading(t("cleanup.analysing"), { id: CLEANUP_TOAST_ID });
			const samples = await loadMono16k(sourceUrl);
			if (!samples || samples.length < SAMPLE_RATE / 2) {
				toast.dismiss(CLEANUP_TOAST_ID);
				toast.error(t("autoCaptions.noAudio"));
				return;
			}

			const spans: CleanupSpan[] = [];
			if (settings.pauses) {
				spans.push(...detectPauses(samples, SAMPLE_RATE, { minPauseMs: settings.minPauseMs }));
			}
			if (settings.fillers !== "off") {
				toast.loading(t("cleanup.transcribing"), { id: CLEANUP_TOAST_ID });
				const words =
					settings.fillers === "crisperwhisper"
						? await transcribeWithCrisperWhisper(settings.serverUrl, samples)
						: (
								await transcribeMono16kToSegments(samples, {
									trimRegions: [],
									onStatus: (phase) =>
										toast.loading(
											phase === "model"
												? t("autoCaptions.loadingModel")
												: t("cleanup.transcribing"),
											{ id: CLEANUP_TOAST_ID },
										),
								})
							).segments;
				spans.push(...detectFillers(words));
			}

			const current = latest.current;
			const durationMs = Math.round(current.durationSec * 1000);
			const shifted = shiftSpans(spans, offsetMs);
			const newTrims = buildCleanupTrims(shifted, current.trimRegions, durationMs);
			toast.dismiss(CLEANUP_TOAST_ID);
			if (!newTrims.length) {
				toast.info(t("cleanup.nothingFound"));
				return;
			}
			const regions: TrimRegion[] = newTrims.map((span) => ({
				id: `trim-${current.nextTrimIdRef.current++}`,
				startMs: span.startMs,
				endMs: span.endMs,
			}));
			current.pushState((prev) => ({ trimRegions: [...prev.trimRegions, ...regions] }));
			const pauses = spans.filter((span) => span.reason === "pause").length;
			const fillers = spans.filter((span) => span.reason === "filler").length;
			toast.success(
				t("cleanup.done", {
					cuts: String(regions.length),
					seconds: formatSeconds(totalDurationMs(newTrims)),
				}),
				{
					description: t("cleanup.doneDetail", {
						pauses: String(pauses),
						fillers: String(fillers),
					}),
				},
			);
		} catch (error) {
			console.error(error);
			toast.dismiss(CLEANUP_TOAST_ID);
			toast.error(t("cleanup.failed"), {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			busy.current = false;
			setIsCleaningUp(false);
		}
	}, []);

	const autoSyncMicrophone = useCallback(async () => {
		const { videoPath, webcamVideoPath, webcamOffsetMs, microphoneAudioPath, t } = latest.current;
		if (!videoPath || !microphoneAudioPath || busy.current) return;
		busy.current = true;
		setIsSyncingMicrophone(true);
		toast.loading(t("microphone.syncing"), { id: SYNC_TOAST_ID });
		try {
			const microphone = await loadMono16k(microphoneAudioPath);
			if (!microphone) throw new Error(t("microphone.noMicrophoneAudio"));
			// Webcam audio usually hears the same voice; the screen recording may only have system audio.
			const candidates: Array<{ url: string; offsetMs: number }> = [];
			if (webcamVideoPath && webcamVideoPath !== microphoneAudioPath) {
				candidates.push({ url: webcamVideoPath, offsetMs: webcamOffsetMs });
			}
			candidates.push({ url: videoPath, offsetMs: 0 });

			let best: { offsetMs: number; confidence: number; endOffsetMs?: number } | null = null;
			for (const candidate of candidates) {
				const reference = await loadMono16k(candidate.url).catch(() => null);
				if (!reference) continue;
				const result = measureSync(reference, microphone, SAMPLE_RATE);
				const measured = {
					offsetMs: microphoneOffsetFromMeasurement(result.offsetMs, candidate.offsetMs),
					confidence: result.confidence,
					endOffsetMs:
						result.endOffsetMs === undefined
							? undefined
							: microphoneOffsetFromMeasurement(result.endOffsetMs, candidate.offsetMs),
				};
				if (!best || measured.confidence > best.confidence) best = measured;
				if (measured.confidence >= RELIABLE_SYNC_CONFIDENCE) break;
			}
			toast.dismiss(SYNC_TOAST_ID);
			if (!best || best.confidence < RELIABLE_SYNC_CONFIDENCE) {
				toast.warning(t("microphone.syncUnsure"));
				return;
			}
			const offsetMs = Math.max(-30_000, Math.min(30_000, best.offsetMs));
			latest.current.setMicrophoneOffsetMs(offsetMs);
			const driftMs = best.endOffsetMs === undefined ? 0 : best.endOffsetMs - best.offsetMs;
			toast.success(t("microphone.synced", { offset: String(offsetMs) }), {
				description:
					Math.abs(driftMs) > 80
						? t("microphone.driftWarning", { drift: String(Math.round(driftMs)) })
						: undefined,
			});
		} catch (error) {
			console.error(error);
			toast.dismiss(SYNC_TOAST_ID);
			toast.error(t("microphone.syncFailed"), {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			busy.current = false;
			setIsSyncingMicrophone(false);
		}
	}, []);

	/**
	 * Transcribe the project for the timeline's transcript lane: the CrisperWhisper server
	 * when it answers (accurate word timings), otherwise the built-in Whisper model.
	 */
	const transcribe = useCallback(async () => {
		const { videoPath, microphoneAudioPath, microphoneMuted, microphoneOffsetMs, t } =
			latest.current;
		if (!videoPath || busy.current) return;
		busy.current = true;
		setIsTranscribing(true);
		try {
			const useMicrophone = Boolean(microphoneAudioPath && !microphoneMuted);
			const sourceUrl = useMicrophone ? (microphoneAudioPath as string) : videoPath;
			const offsetMs = useMicrophone ? microphoneOffsetMs : 0;
			toast.loading(t("cleanup.analysing"), { id: TRANSCRIPT_TOAST_ID });
			const samples = await loadMono16k(sourceUrl);
			if (!samples || samples.length < SAMPLE_RATE / 2) {
				toast.dismiss(TRANSCRIPT_TOAST_ID);
				toast.error(t("autoCaptions.noAudio"));
				return;
			}
			const { serverUrl } = loadCleanupSettings();
			const useServer = await isCrisperWhisperReachable(serverUrl);
			toast.loading(t("cleanup.transcribing"), { id: TRANSCRIPT_TOAST_ID });
			const words = useServer
				? await transcribeWithCrisperWhisper(serverUrl, samples)
				: (
						await transcribeMono16kToSegments(samples, {
							trimRegions: [],
							onStatus: (phase) =>
								toast.loading(
									phase === "model" ? t("autoCaptions.loadingModel") : t("cleanup.transcribing"),
									{ id: TRANSCRIPT_TOAST_ID },
								),
						})
					).segments;
			const transcript = transcriptFromSeconds(
				words,
				useServer ? "crisperwhisper" : "whisper",
				offsetMs,
			);
			toast.dismiss(TRANSCRIPT_TOAST_ID);
			if (!transcript) {
				toast.info(t("autoCaptions.noneHeard"));
				return;
			}
			latest.current.setTranscript?.(transcript);
			toast.success(
				t("transcriptLane.done", {
					words: String(transcript.words.length),
					engine: useServer ? "CrisperWhisper" : "Whisper",
				}),
			);
		} catch (error) {
			console.error(error);
			toast.dismiss(TRANSCRIPT_TOAST_ID);
			toast.error(t("transcriptLane.failed"), {
				description: error instanceof Error ? error.message : String(error),
			});
		} finally {
			busy.current = false;
			setIsTranscribing(false);
		}
	}, []);

	return {
		isCleaningUp,
		runCleanup,
		isSyncingMicrophone,
		autoSyncMicrophone,
		isTranscribing,
		transcribe,
	};
}
