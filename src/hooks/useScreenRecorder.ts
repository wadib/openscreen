import { fixWebmDuration } from "@fix-webm-duration/fix";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useScopedT } from "@/contexts/I18nContext";
import {
	type NativeMacRecordingRequest,
	parseMacDisplayIdFromSourceId,
	parseMacWindowIdFromSourceId,
} from "@/lib/nativeMacRecording";
import {
	type NativeWindowsRecordingRequest,
	parseWindowHandleFromSourceId,
} from "@/lib/nativeWindowsRecording";
import { loadRecordingPreferences, saveRecordingPreferences } from "@/lib/recordingPreferences";
import type { CursorCaptureMode, RecordedVideoAssetInput } from "@/lib/recordingSession";
import { requestCameraAccess } from "@/lib/requestCameraAccess";
import { createRecorderHandle, type RecorderHandle } from "./recorderHandle";
import { useRecordingPreviewHost } from "./useRecordingPreviewHost";

const TARGET_FRAME_RATE = 60;
const MIN_FRAME_RATE = 30;
const TARGET_WIDTH = 3840;
const TARGET_HEIGHT = 2160;
const FOUR_K_PIXELS = TARGET_WIDTH * TARGET_HEIGHT;
const QHD_WIDTH = 2560;
const QHD_HEIGHT = 1440;
const QHD_PIXELS = QHD_WIDTH * QHD_HEIGHT;

const BITRATE_4K = 45_000_000;
const BITRATE_QHD = 28_000_000;
const BITRATE_BASE = 18_000_000;
const HIGH_FRAME_RATE_THRESHOLD = 60;
const HIGH_FRAME_RATE_BOOST = 1.7;

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

const CODEC_ALIGNMENT = 2;

const BITS_PER_MEGABIT = 1_000_000;
const CHROME_MEDIA_SOURCE = "desktop";
const RECORDING_FILE_PREFIX = "recording-";
const VIDEO_FILE_EXTENSION = ".webm";
const WEBCAM_FILE_SUFFIX = "-webcam";
const MICROPHONE_FILE_SUFFIX = "-microphone";

const AUDIO_BITRATE_VOICE = 128_000;
const AUDIO_BITRATE_SYSTEM = 192_000;

const WEBCAM_TARGET_FRAME_RATE = 30;

type UseScreenRecorderReturn = {
	recording: boolean;
	countdownActive: boolean;
	paused: boolean;
	elapsedSeconds: number;
	toggleRecording: () => void;
	togglePaused: () => void;
	canPauseRecording: boolean;
	restartRecording: () => void;
	cancelRecording: () => void;
	microphoneEnabled: boolean;
	setMicrophoneEnabled: (enabled: boolean) => void;
	microphoneGain: number;
	setMicrophoneGain: (gain: number) => void;
	microphoneDeviceId: string | undefined;
	setMicrophoneDeviceId: (deviceId: string | undefined) => void;
	microphoneDeviceName: string | undefined;
	setMicrophoneDeviceName: (deviceName: string | undefined) => void;
	webcamDeviceId: string | undefined;
	setWebcamDeviceId: (deviceId: string | undefined) => void;
	webcamDeviceName: string | undefined;
	setWebcamDeviceName: (deviceName: string | undefined) => void;
	systemAudioEnabled: boolean;
	setSystemAudioEnabled: (enabled: boolean) => void;
	webcamEnabled: boolean;
	setWebcamEnabled: (enabled: boolean) => Promise<boolean>;
	cursorCaptureMode: CursorCaptureMode;
	setCursorCaptureMode: (mode: CursorCaptureMode) => void;
};

type NativeWindowsRecordingHandle = {
	recordingId: number;
	finalizing: boolean;
	paused: boolean;
	webcamRecorder: RecorderHandle | null;
	webcamOffsetMs: number;
	microphoneRecorder: RecorderHandle | null;
	microphoneOffsetMs: number;
};

type NativeMacRecordingHandle = {
	recordingId: number;
	finalizing: boolean;
	paused: boolean;
};

export function useScreenRecorder(): UseScreenRecorderReturn {
	const t = useScopedT("editor");
	const [recording, setRecording] = useState(false);
	const [paused, setPaused] = useState(false);
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const [preferences] = useState(loadRecordingPreferences);
	const [microphoneEnabled, setMicrophoneEnabled] = useState(preferences.microphoneEnabled);
	const [microphoneGain, setMicrophoneGain] = useState(preferences.microphoneGain);
	const [microphoneDeviceId, setMicrophoneDeviceId] = useState(preferences.microphoneDeviceId);
	const [microphoneDeviceName, setMicrophoneDeviceName] = useState(
		preferences.microphoneDeviceName,
	);
	const [webcamDeviceId, setWebcamDeviceId] = useState(preferences.webcamDeviceId);
	const [webcamDeviceName, setWebcamDeviceName] = useState(preferences.webcamDeviceName);
	const [systemAudioEnabled, setSystemAudioEnabled] = useState(preferences.systemAudioEnabled);
	const [webcamEnabled, setWebcamEnabledState] = useState(preferences.webcamEnabled);
	const [cursorCaptureMode, setCursorCaptureMode] = useState<CursorCaptureMode>(
		preferences.cursorCaptureMode,
	);
	const screenRecorder = useRef<RecorderHandle | null>(null);
	const webcamRecorder = useRef<RecorderHandle | null>(null);
	const nativeWindowsRecording = useRef<NativeWindowsRecordingHandle | null>(null);
	const nativeMacRecording = useRef<NativeMacRecordingHandle | null>(null);
	const stream = useRef<MediaStream | null>(null);
	const screenStream = useRef<MediaStream | null>(null);
	const microphoneStream = useRef<MediaStream | null>(null);
	const webcamStream = useRef<MediaStream | null>(null);
	const [previewWebcamStream, setPreviewWebcamStream] = useState<MediaStream | null>(null);
	useRecordingPreviewHost(previewWebcamStream, cursorCaptureMode, recording && paused);
	const mixingContext = useRef<AudioContext | null>(null);
	const recordingId = useRef<number>(0);
	const accumulatedDurationMs = useRef(0);
	const segmentStartedAt = useRef<number | null>(null);
	// Native pause/resume awaits the main process; a second toggle in that window would read
	// the stale paused flag and repeat the same command instead of reversing it.
	const pauseToggleInFlight = useRef(false);
	const finalizingRecordingId = useRef<number | null>(null);
	const allowAutoFinalize = useRef(false);
	const discardRecordingId = useRef<number | null>(null);
	const restarting = useRef(false);
	const countdownRunId = useRef(0);
	const recordingStartInFlight = useRef(false);
	const toggleRecordingFromShortcut = useRef<() => void>(() => undefined);
	const togglePauseFromShortcut = useRef<() => void>(() => undefined);
	const [countdownActive, setCountdownActive] = useState(false);
	const webcamReady = useRef(false);
	const webcamAcquireId = useRef(0);
	const canPauseRecording =
		recording &&
		Boolean(
			(nativeWindowsRecording.current && !nativeWindowsRecording.current.finalizing) ||
				(nativeMacRecording.current && !nativeMacRecording.current.finalizing) ||
				(screenRecorder.current && screenRecorder.current.recorder.state !== "inactive"),
		);

	// Persist explicit selections, not transient capture failures or stream teardown.
	const selectMicrophoneEnabled = useCallback((value: boolean) => {
		setMicrophoneEnabled(value);
		saveRecordingPreferences({ microphoneEnabled: value });
	}, []);
	const selectMicrophoneGain = useCallback((value: number) => {
		const gain = Math.min(2, Math.max(0, value));
		setMicrophoneGain(gain);
		saveRecordingPreferences({ microphoneGain: gain });
	}, []);
	const selectMicrophoneDeviceId = useCallback((value: string | undefined) => {
		setMicrophoneDeviceId(value);
		saveRecordingPreferences({ microphoneDeviceId: value });
	}, []);
	const selectMicrophoneDeviceName = useCallback((value: string | undefined) => {
		setMicrophoneDeviceName(value);
		saveRecordingPreferences({ microphoneDeviceName: value });
	}, []);
	const selectWebcamDeviceId = useCallback((value: string | undefined) => {
		setWebcamDeviceId(value);
		saveRecordingPreferences({ webcamDeviceId: value });
	}, []);
	const selectWebcamDeviceName = useCallback((value: string | undefined) => {
		setWebcamDeviceName(value);
		saveRecordingPreferences({ webcamDeviceName: value });
	}, []);
	const selectSystemAudioEnabled = useCallback((value: boolean) => {
		setSystemAudioEnabled(value);
		saveRecordingPreferences({ systemAudioEnabled: value });
	}, []);
	const selectCursorCaptureMode = useCallback((value: CursorCaptureMode) => {
		setCursorCaptureMode(value);
		saveRecordingPreferences({ cursorCaptureMode: value });
	}, []);

	const getRecordingDurationMs = useCallback(() => {
		const segmentDuration =
			segmentStartedAt.current === null ? 0 : Date.now() - segmentStartedAt.current;
		return accumulatedDurationMs.current + segmentDuration;
	}, []);

	const selectMimeType = (withAudio = false) => {
		// H.264 first: hardware-accelerated, so sharp real-time output. AV1/VP9 are
		// better for distribution but too CPU-heavy for live 60 fps capture (software
		// encoder falls behind and produces blurry frames).
		const preferred = [
			"video/webm;codecs=h264",
			"video/webm;codecs=vp8",
			"video/webm;codecs=vp9",
			"video/webm;codecs=av1",
			"video/webm",
		];

		const candidates = withAudio
			? preferred.map((type) => (type.includes("codecs=") ? `${type},opus` : type))
			: preferred;
		return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
	};

	const selectAudioMimeType = () => {
		const preferred = ["audio/webm;codecs=opus", "audio/webm"];
		return preferred.find((type) => MediaRecorder.isTypeSupported(type)) ?? "audio/webm";
	};

	const computeBitrate = (width: number, height: number) => {
		const pixels = width * height;
		const highFrameRateBoost =
			TARGET_FRAME_RATE >= HIGH_FRAME_RATE_THRESHOLD ? HIGH_FRAME_RATE_BOOST : 1;

		if (pixels >= FOUR_K_PIXELS) {
			return Math.round(BITRATE_4K * highFrameRateBoost);
		}

		if (pixels >= QHD_PIXELS) {
			return Math.round(BITRATE_QHD * highFrameRateBoost);
		}

		return Math.round(BITRATE_BASE * highFrameRateBoost);
	};

	const teardownMedia = useCallback(() => {
		if (stream.current) {
			stream.current.getTracks().forEach((track) => track.stop());
			stream.current = null;
		}
		if (screenStream.current) {
			screenStream.current.getTracks().forEach((track) => track.stop());
			screenStream.current = null;
		}
		if (microphoneStream.current) {
			microphoneStream.current.getTracks().forEach((track) => track.stop());
			microphoneStream.current = null;
		}
		if (mixingContext.current) {
			mixingContext.current.close().catch(() => {
				// Ignore close errors during recorder teardown.
			});
			mixingContext.current = null;
		}
	}, []);

	const stopWebcamPreviewStream = useCallback(() => {
		if (!webcamStream.current) {
			return;
		}

		webcamAcquireId.current++;
		webcamStream.current.getTracks().forEach((track) => {
			track.onended = null;
			track.stop();
		});
		webcamStream.current = null;
		setPreviewWebcamStream(null);
		webcamReady.current = true;
	}, []);

	const setWebcamEnabled = useCallback(
		async (enabled: boolean) => {
			if (!enabled) {
				saveRecordingPreferences({ webcamEnabled: false });
				setWebcamEnabledState(false);
				return true;
			}

			const accessResult = await requestCameraAccess();
			if (!accessResult.success) {
				toast.error(t("recording.failedCameraAccess"));
				return false;
			}

			if (!accessResult.granted) {
				toast.error(t("recording.cameraBlocked"));
				return false;
			}

			setWebcamEnabledState(true);
			saveRecordingPreferences({ webcamEnabled: true });
			return true;
		},
		[t],
	);

	useEffect(() => {
		if (!webcamEnabled) return;

		let cancelled = false;
		let acquiredStream: MediaStream | null = null;
		const thisAcquireId = ++webcamAcquireId.current;
		webcamReady.current = false;

		const acquire = async () => {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: webcamDeviceId
						? {
								deviceId: { exact: webcamDeviceId },
								frameRate: { ideal: WEBCAM_TARGET_FRAME_RATE, max: WEBCAM_TARGET_FRAME_RATE },
							}
						: {
								frameRate: { ideal: WEBCAM_TARGET_FRAME_RATE, max: WEBCAM_TARGET_FRAME_RATE },
							},
				});

				if (cancelled || thisAcquireId !== webcamAcquireId.current) {
					stream.getTracks().forEach((track) => {
						track.onended = null;
						track.stop();
					});
					return;
				}

				acquiredStream = stream;
				stream.getVideoTracks().forEach((track) => {
					track.onended = () => {
						webcamStream.current = null;
						setPreviewWebcamStream(null);
						if (!restarting.current) {
							toast.error(t("recording.cameraDisconnected"));
						}
					};
				});
				webcamStream.current = stream;
				setPreviewWebcamStream(stream);
				webcamReady.current = true;
			} catch (cameraError) {
				if (!cancelled) {
					console.warn("Failed to get webcam access:", cameraError);
					const isDeviceError =
						cameraError instanceof DOMException &&
						[
							"NotFoundError",
							"DevicesNotFoundError",
							"OverconstrainedError",
							"NotReadableError",
						].includes(cameraError.name);
					toast.error(t(isDeviceError ? "recording.cameraNotFound" : "recording.cameraBlocked"));
					webcamReady.current = true;
				}
			}
		};

		void acquire();

		return () => {
			cancelled = true;
			webcamReady.current = false;
			if (acquiredStream) {
				acquiredStream.getTracks().forEach((track) => {
					track.onended = null;
					track.stop();
				});
				webcamStream.current = null;
				setPreviewWebcamStream(null);
			}
		};
	}, [webcamEnabled, webcamDeviceId, t]);

	const finalizeRecording = useCallback(
		(
			activeScreenRecorder: RecorderHandle,
			activeWebcamRecorder: RecorderHandle | null,
			duration: number,
			activeRecordingId: number,
		) => {
			if (finalizingRecordingId.current === activeRecordingId) {
				return;
			}
			finalizingRecordingId.current = activeRecordingId;

			if (screenRecorder.current === activeScreenRecorder) {
				screenRecorder.current = null;
			}
			if (activeWebcamRecorder && webcamRecorder.current === activeWebcamRecorder) {
				webcamRecorder.current = null;
			}

			teardownMedia();
			setRecording(false);
			setPaused(false);
			setElapsedSeconds(0);
			accumulatedDurationMs.current = 0;
			segmentStartedAt.current = null;
			window.electronAPI?.setRecordingState(false);

			void (async () => {
				// Each disk stream must end up either saved or explicitly discarded.
				// store-recorded-session finalizes the streams included in a successful
				// save; the finally block discards everything else.
				let storeSucceeded = false;
				let webcamIncludedInSave = false;
				try {
					const screenBlob = await activeScreenRecorder.recordedBlobPromise;
					if (discardRecordingId.current === activeRecordingId) {
						window.electronAPI?.discardCursorTelemetry(activeRecordingId);
						return;
					}
					// When streaming succeeded the blob is empty; the data is already on disk.
					if (!activeScreenRecorder.isStreaming() && screenBlob.size === 0) {
						return;
					}

					const screenFileName = `${RECORDING_FILE_PREFIX}${activeRecordingId}${VIDEO_FILE_EXTENSION}`;
					const webcamFileName = `${RECORDING_FILE_PREFIX}${activeRecordingId}${WEBCAM_FILE_SUFFIX}${VIDEO_FILE_EXTENSION}`;

					// Only fix duration / convert to ArrayBuffer for in-memory data;
					// streamed recordings are patched on disk by the main process.
					let screenVideoData: ArrayBuffer = new ArrayBuffer(0);
					if (!activeScreenRecorder.isStreaming() && screenBlob.size > 0) {
						const fixedScreenBlob = await fixWebmDuration(screenBlob, duration);
						screenVideoData = await fixedScreenBlob.arrayBuffer();
					}

					let webcamVideoData: ArrayBuffer | undefined;
					if (activeWebcamRecorder) {
						const webcamBlob = await activeWebcamRecorder.recordedBlobPromise.catch(() => null);
						if (!activeWebcamRecorder.isStreaming() && webcamBlob && webcamBlob.size > 0) {
							const fixedWebcamBlob = await fixWebmDuration(webcamBlob, duration);
							webcamVideoData = await fixedWebcamBlob.arrayBuffer();
						} else if (activeWebcamRecorder.isStreaming()) {
							webcamVideoData = new ArrayBuffer(0);
						}
					}
					webcamIncludedInSave = webcamVideoData !== undefined;

					const result = await window.electronAPI.storeRecordedSession({
						screen: {
							videoData: screenVideoData,
							fileName: screenFileName,
						},
						webcam:
							webcamVideoData !== undefined
								? { videoData: webcamVideoData, fileName: webcamFileName }
								: undefined,
						createdAt: activeRecordingId,
						cursorCaptureMode,
						durationMs: duration,
					});

					if (!result.success) {
						console.error("Failed to store recording session:", result.message);
						return;
					}
					// store-recorded-session has flushed and closed the saved streams.
					storeSucceeded = true;

					if (result.session) {
						await window.electronAPI.setCurrentRecordingSession(result.session);
					} else if (result.path) {
						await window.electronAPI.setCurrentVideoPath(result.path);
					}

					await window.electronAPI.finishRecording();
				} catch (error) {
					console.error("Error saving recording:", error);
				} finally {
					// Discard any recorder whose data wasn't part of a successful save (discarded
					// run, failed save, or a webcam whose disk write failed while the screen still
					// saved) so no stream or partial file is left open or orphaned.
					if (!storeSucceeded) {
						await activeScreenRecorder.discard().catch(() => undefined);
					}
					if (activeWebcamRecorder && !(storeSucceeded && webcamIncludedInSave)) {
						await activeWebcamRecorder.discard().catch(() => undefined);
					}
					if (finalizingRecordingId.current === activeRecordingId) {
						finalizingRecordingId.current = null;
					}
					if (discardRecordingId.current === activeRecordingId) {
						discardRecordingId.current = null;
					}
				}
			})();
		},
		[cursorCaptureMode, teardownMedia],
	);

	const finalizeNativeWindowsRecording = useCallback(
		async (discard = false) => {
			const activeNativeRecording = nativeWindowsRecording.current;
			if (!activeNativeRecording || activeNativeRecording.finalizing) {
				return false;
			}

			activeNativeRecording.finalizing = true;
			const activeWebcamRecorder = activeNativeRecording.webcamRecorder;
			const activeMicrophoneRecorder = activeNativeRecording.microphoneRecorder;
			const duration = Math.max(0, getRecordingDurationMs());
			for (const sidecar of new Set([activeWebcamRecorder, activeMicrophoneRecorder])) {
				if (sidecar?.recorder.state === "recording" || sidecar?.recorder.state === "paused") {
					try {
						sidecar.recorder.stop();
					} catch {
						// Recorder may already be stopping.
					}
				}
			}
			if (activeWebcamRecorder && webcamRecorder.current === activeWebcamRecorder) {
				webcamRecorder.current = null;
			}

			const clearNativeRecordingState = () => {
				if (nativeWindowsRecording.current !== activeNativeRecording) return;
				nativeWindowsRecording.current = null;
				if (microphoneStream.current) {
					microphoneStream.current.getTracks().forEach((track) => track.stop());
					microphoneStream.current = null;
				}
				setRecording(false);
				setPaused(false);
				setElapsedSeconds(0);
				accumulatedDurationMs.current = 0;
				segmentStartedAt.current = null;
				void window.electronAPI
					.setRecordingState(false)
					.catch((error) => console.error("Failed to clear recording state:", error));
			};

			let captureStopped = false;
			try {
				const result = await window.electronAPI.stopNativeWindowsRecording(discard);
				captureStopped = result.success || result.stopped === true;
				if ((discard && result.success) || result.discarded) {
					await Promise.all([
						activeWebcamRecorder?.discard().catch(() => undefined),
						activeMicrophoneRecorder?.discard().catch(() => undefined),
					]);
					clearNativeRecordingState();
					return true;
				}
				if (!result.success) {
					console.error("Failed to stop native Windows recording:", result.error);
					toast.error(result.error ?? "Failed to stop native Windows recording");
					if (!captureStopped) activeNativeRecording.finalizing = false;
					return true;
				}
				if (!result.session && !result.path) return true;

				const nativeScreenPath = result.session?.screenVideoPath ?? result.path;
				let storedSession = result.session;
				if (nativeScreenPath && (activeWebcamRecorder || activeMicrophoneRecorder)) {
					const webcamBlob = activeWebcamRecorder
						? await activeWebcamRecorder.recordedBlobPromise
						: null;
					const microphoneBlob = activeMicrophoneRecorder
						? await activeMicrophoneRecorder.recordedBlobPromise
						: null;
					if (
						activeMicrophoneRecorder &&
						!activeMicrophoneRecorder.isStreaming() &&
						(!microphoneBlob || microphoneBlob.size === 0)
					) {
						throw new Error("Microphone recording produced no audio data");
					}
					const sharedMicrophone = activeMicrophoneRecorder === activeWebcamRecorder;
					const webcamAsset =
						activeWebcamRecorder && webcamBlob && webcamBlob.size > 0
							? {
									videoData: await (
										await fixWebmDuration(
											webcamBlob,
											Math.max(1, duration - activeNativeRecording.webcamOffsetMs),
										)
									).arrayBuffer(),
									fileName: `${RECORDING_FILE_PREFIX}${activeNativeRecording.recordingId}${WEBCAM_FILE_SUFFIX}${VIDEO_FILE_EXTENSION}`,
								}
							: undefined;
					const microphoneAsset =
						sharedMicrophone && webcamAsset
							? { fileName: webcamAsset.fileName, videoData: new ArrayBuffer(0) }
							: activeMicrophoneRecorder
								? {
										videoData:
											activeMicrophoneRecorder.isStreaming() || !microphoneBlob
												? new ArrayBuffer(0)
												: await (await fixWebmDuration(microphoneBlob, duration)).arrayBuffer(),
										fileName: `${RECORDING_FILE_PREFIX}${activeNativeRecording.recordingId}${MICROPHONE_FILE_SUFFIX}${VIDEO_FILE_EXTENSION}`,
									}
								: undefined;
					const nativeScreenFileName =
						nativeScreenPath.split(/[\\/]/).pop() ??
						`${RECORDING_FILE_PREFIX}${activeNativeRecording.recordingId}.mp4`;
					const stored = await window.electronAPI.storeRecordedSession({
						screen: { videoData: new ArrayBuffer(0), fileName: nativeScreenFileName },
						...(webcamAsset
							? { webcam: webcamAsset, webcamOffsetMs: activeNativeRecording.webcamOffsetMs }
							: {}),
						...(microphoneAsset
							? {
									microphone: microphoneAsset,
									microphoneOffsetMs: activeNativeRecording.microphoneOffsetMs,
									microphoneGain,
								}
							: {}),
						createdAt: activeNativeRecording.recordingId,
						cursorCaptureMode,
						durationMs: duration,
					});
					if (!stored.success) {
						throw new Error(stored.message ?? "Failed to attach recording sidecars");
					}
					if (stored.session) storedSession = stored.session;
				}

				clearNativeRecordingState();
				if (storedSession) {
					await window.electronAPI.setCurrentRecordingSession(storedSession);
				} else if (result.path) {
					await window.electronAPI.setCurrentVideoPath(result.path);
				}

				await window.electronAPI.finishRecording();
				return true;
			} catch (error) {
				console.error("Error saving native Windows recording:", error);
				toast.error(
					error instanceof Error ? error.message : "Failed to save native Windows recording",
				);
				if (!captureStopped) activeNativeRecording.finalizing = false;
				return true;
			} finally {
				if (captureStopped) clearNativeRecordingState();
				if (discardRecordingId.current === activeNativeRecording.recordingId) {
					discardRecordingId.current = null;
				}
			}
		},
		[cursorCaptureMode, getRecordingDurationMs, microphoneGain],
	);

	const finalizeNativeMacRecording = useCallback(
		async (discard = false) => {
			const activeNativeRecording = nativeMacRecording.current;
			if (!activeNativeRecording || activeNativeRecording.finalizing) {
				return false;
			}

			activeNativeRecording.finalizing = true;
			const duration = Math.max(0, getRecordingDurationMs());
			const activeWebcamRecorder = webcamRecorder.current;
			if (activeWebcamRecorder && webcamRecorder.current === activeWebcamRecorder) {
				webcamRecorder.current = null;
			}
			const webcamAssetPromise = (async (): Promise<RecordedVideoAssetInput | undefined> => {
				if (!activeWebcamRecorder) {
					return undefined;
				}

				try {
					if (activeWebcamRecorder.recorder.state !== "inactive") {
						activeWebcamRecorder.recorder.stop();
					}
					const webcamBlob = await activeWebcamRecorder.recordedBlobPromise;
					if (!webcamBlob || webcamBlob.size === 0) {
						return undefined;
					}
					const fixedWebcamBlob = await fixWebmDuration(webcamBlob, duration);
					return {
						videoData: await fixedWebcamBlob.arrayBuffer(),
						fileName: `${RECORDING_FILE_PREFIX}${activeNativeRecording.recordingId}${WEBCAM_FILE_SUFFIX}${VIDEO_FILE_EXTENSION}`,
					};
				} catch (error) {
					console.error("Failed to finalize native macOS webcam recording:", error);
					return undefined;
				}
			})();

			const clearNativeRecordingState = () => {
				nativeMacRecording.current = null;
				setRecording(false);
				setPaused(false);
				setElapsedSeconds(0);
				accumulatedDurationMs.current = 0;
				segmentStartedAt.current = null;
			};

			try {
				const result = await window.electronAPI.stopNativeMacRecording(discard);
				const webcamAsset = await webcamAssetPromise;
				if (discard || result.discarded) {
					clearNativeRecordingState();
					return true;
				}
				if (!result.success) {
					console.error("Failed to stop native macOS recording:", result.error);
					toast.error(result.error ?? "Failed to stop native macOS recording");
					activeNativeRecording.finalizing = false;
					return true;
				}

				if (webcamAsset && result.path) {
					const attachResult = await window.electronAPI.attachNativeMacWebcamRecording({
						screenVideoPath: result.path,
						recordingId: activeNativeRecording.recordingId,
						webcam: webcamAsset,
						cursorCaptureMode,
					});
					if (attachResult.success) {
						result.session = attachResult.session;
					} else {
						console.error("Failed to attach native macOS webcam recording:", attachResult.error);
						toast.error(attachResult.error ?? "Failed to store webcam recording");
					}
				}

				clearNativeRecordingState();
				if (result.session) {
					await window.electronAPI.setCurrentRecordingSession(result.session);
				} else if (result.path) {
					await window.electronAPI.setCurrentVideoPath(result.path);
				}

				await window.electronAPI.finishRecording();
				return true;
			} catch (error) {
				console.error("Error saving native macOS recording:", error);
				toast.error(
					error instanceof Error ? error.message : "Failed to save native macOS recording",
				);
				activeNativeRecording.finalizing = false;
				return true;
			} finally {
				if (discardRecordingId.current === activeNativeRecording.recordingId) {
					discardRecordingId.current = null;
				}
			}
		},
		[cursorCaptureMode, getRecordingDurationMs],
	);

	const stopRecording = useRef<() => void>(() => undefined);
	useEffect(() => {
		stopRecording.current = () => {
			if (nativeWindowsRecording.current) {
				void finalizeNativeWindowsRecording(false);
				return;
			}
			if (nativeMacRecording.current) {
				void finalizeNativeMacRecording(false);
				return;
			}

			const activeScreenRecorder = screenRecorder.current;
			if (!activeScreenRecorder) {
				return;
			}

			const activeWebcamRecorder = webcamRecorder.current;
			const duration = getRecordingDurationMs();
			const activeRecordingId = recordingId.current;

			finalizeRecording(
				activeScreenRecorder,
				activeWebcamRecorder ?? null,
				duration,
				activeRecordingId,
			);

			if (
				activeScreenRecorder.recorder.state === "recording" ||
				activeScreenRecorder.recorder.state === "paused"
			) {
				try {
					activeScreenRecorder.recorder.stop();
				} catch {
					// Recorder may already be stopping.
				}
			}
			if (activeWebcamRecorder) {
				if (
					activeWebcamRecorder.recorder.state === "recording" ||
					activeWebcamRecorder.recorder.state === "paused"
				) {
					try {
						activeWebcamRecorder.recorder.stop();
					} catch {
						// Recorder may already be stopping.
					}
				}
			}
		};
	}, [
		finalizeNativeWindowsRecording,
		finalizeNativeMacRecording,
		finalizeRecording,
		getRecordingDurationMs,
	]);

	const safeHideCountdownOverlay = useCallback(async (runId: number) => {
		try {
			await window.electronAPI.hideCountdownOverlay(runId);
		} catch (error) {
			console.warn("Failed to hide countdown overlay:", error);
		}
	}, []);

	useEffect(() => {
		const cleanups: Array<() => void> = [];

		if (window.electronAPI?.onStopRecordingFromTray) {
			cleanups.push(
				window.electronAPI.onStopRecordingFromTray(() => {
					stopRecording.current();
				}),
			);
		}
		if (window.electronAPI?.onToggleRecordingShortcut) {
			cleanups.push(
				window.electronAPI.onToggleRecordingShortcut(() => {
					toggleRecordingFromShortcut.current();
				}),
			);
		}
		if (window.electronAPI?.onTogglePauseShortcut) {
			cleanups.push(
				window.electronAPI.onTogglePauseShortcut(() => {
					togglePauseFromShortcut.current();
				}),
			);
		}

		return () => {
			const activeRunId = countdownRunId.current;
			void window.electronAPI
				.releaseQuietRecording?.()
				.catch((error) => console.error("Quiet mode restoration failed:", error));
			for (const cleanup of cleanups) cleanup();
			countdownRunId.current += 1;
			void safeHideCountdownOverlay(activeRunId);
			allowAutoFinalize.current = false;
			restarting.current = false;
			discardRecordingId.current = null;
			if (nativeWindowsRecording.current) {
				void finalizeNativeWindowsRecording(true);
			}
			if (nativeMacRecording.current) {
				void finalizeNativeMacRecording(true);
			}

			if (
				screenRecorder.current?.recorder.state === "recording" ||
				screenRecorder.current?.recorder.state === "paused"
			) {
				try {
					screenRecorder.current.recorder.stop();
				} catch {
					// Ignore recorder teardown errors during cleanup.
				}
			}
			if (
				webcamRecorder.current?.recorder.state === "recording" ||
				webcamRecorder.current?.recorder.state === "paused"
			) {
				try {
					webcamRecorder.current.recorder.stop();
				} catch {
					// Ignore recorder teardown errors during cleanup.
				}
			}
			screenRecorder.current = null;
			webcamRecorder.current = null;
			teardownMedia();
		};
	}, [
		teardownMedia,
		safeHideCountdownOverlay,
		finalizeNativeWindowsRecording,
		finalizeNativeMacRecording,
	]);

	const safeShowCountdownOverlay = async (value: number, runId: number) => {
		try {
			await window.electronAPI.showCountdownOverlay(value, runId);
			return true;
		} catch (error) {
			console.warn("Failed to show countdown overlay:", error);
			return false;
		}
	};

	const cancelCountdown = () => {
		const activeRunId = countdownRunId.current;
		countdownRunId.current += 1;
		setCountdownActive(false);
		void safeHideCountdownOverlay(activeRunId);
	};

	const safeSetCountdownOverlayValue = async (value: number, runId: number) => {
		try {
			await window.electronAPI.setCountdownOverlayValue(value, runId);
		} catch (error) {
			console.warn("Failed to update countdown overlay value:", error);
		}
	};

	const isCountdownRunActive = (runId?: number) =>
		runId === undefined || countdownRunId.current === runId;

	const waitForWebcamReady = async () => {
		if (webcamReady.current) {
			return;
		}

		await new Promise<void>((resolve) => {
			const interval = setInterval(() => {
				if (webcamReady.current) {
					clearInterval(interval);
					resolve();
				}
			}, 50);
			setTimeout(() => {
				clearInterval(interval);
				resolve();
			}, 5000);
		});
	};

	const startNativeWindowsRecordingIfAvailable = async (
		selectedSource: ProcessedDesktopSource,
		countdownRunToken?: number,
	) => {
		try {
			const platform = await window.electronAPI.getPlatform();
			if (platform !== "win32") {
				return false;
			}

			const availability = await window.electronAPI.isNativeWindowsCaptureAvailable();
			if (!availability.success || !availability.available) {
				if (availability.reason === "unsupported-os") {
					return false;
				}
				if (availability.reason === "missing-helper") {
					console.warn("Native Windows capture helper is not available; using browser capture.");
					return false;
				}

				throw new Error(availability.error ?? "Native Windows capture is not available.");
			}

			if (!isCountdownRunActive(countdownRunToken)) {
				return true;
			}

			const activeRecordingId = Date.now();
			const displayId = Number(selectedSource.display_id);
			const sourceType = selectedSource.id.startsWith("window:") ? "window" : "display";
			const windowHandle = parseWindowHandleFromSourceId(selectedSource.id);
			let browserMicrophoneStream: MediaStream | null = null;
			if (microphoneEnabled) {
				try {
					browserMicrophoneStream = await navigator.mediaDevices.getUserMedia({
						audio: microphoneDeviceId
							? {
									deviceId: { exact: microphoneDeviceId },
									echoCancellation: false,
									noiseSuppression: false,
									autoGainControl: false,
								}
							: {
									echoCancellation: false,
									noiseSuppression: false,
									autoGainControl: false,
								},
						video: false,
					});
					microphoneStream.current = browserMicrophoneStream;
				} catch (audioError) {
					console.error("Failed to acquire the selected microphone:", audioError);
					throw new Error(t("recording.microphoneDenied"));
				}
			}
			if (webcamEnabled) {
				await waitForWebcamReady();
				if (!isCountdownRunActive(countdownRunToken)) {
					return true;
				}
			}
			const browserWebcamStream = webcamEnabled ? webcamStream.current : null;
			if (webcamEnabled && !browserWebcamStream) {
				stopWebcamPreviewStream();
			}
			const request: NativeWindowsRecordingRequest = {
				recordingId: activeRecordingId,
				source: {
					type: sourceType,
					sourceId: selectedSource.id,
					...(Number.isFinite(displayId) ? { displayId } : {}),
					...(windowHandle ? { windowHandle } : {}),
				},
				video: {
					fps: TARGET_FRAME_RATE,
					width: TARGET_WIDTH,
					height: TARGET_HEIGHT,
				},
				audio: {
					system: {
						enabled: systemAudioEnabled,
					},
					microphone: {
						// Chromium owns the exact selected device ID. Record it as a
						// separate sidecar instead of guessing a WASAPI endpoint by label.
						enabled: false,
						gain: microphoneGain,
					},
				},
				webcam: {
					enabled: webcamEnabled && !browserWebcamStream,
					deviceId: webcamDeviceId,
					deviceName: webcamDeviceName,
					width: 0,
					height: 0,
					fps: WEBCAM_TARGET_FRAME_RATE,
				},
				cursor: {
					mode: cursorCaptureMode,
				},
			};
			const result = await window.electronAPI.startNativeWindowsRecording(request);
			if (!result.success || !result.recordingId) {
				browserMicrophoneStream?.getTracks().forEach((track) => track.stop());
				if (microphoneStream.current === browserMicrophoneStream) microphoneStream.current = null;
				throw new Error(result.error ?? "Native Windows capture failed.");
			}
			let browserWebcamRecorder: RecorderHandle | null = null;
			let browserMicrophoneRecorder: RecorderHandle | null = null;
			let microphoneOffsetMs = 0;
			let webcamOffsetMs = 0;
			if (browserWebcamStream || browserMicrophoneStream) {
				try {
					const offsetMs = Math.max(0, Date.now() - (result.captureStartedAtMs ?? Date.now()));
					if (browserWebcamStream) {
						// One muxer keeps microphone and camera timestamps aligned through pauses.
						const stream = browserMicrophoneStream
							? new MediaStream([
									...browserWebcamStream.getVideoTracks(),
									...browserMicrophoneStream.getAudioTracks(),
								])
							: browserWebcamStream;
						browserWebcamRecorder = createRecorderHandle(stream, {
							mimeType: selectMimeType(Boolean(browserMicrophoneStream)),
							videoBitsPerSecond: BITRATE_BASE,
							...(browserMicrophoneStream ? { audioBitsPerSecond: AUDIO_BITRATE_VOICE } : {}),
						});
						webcamOffsetMs = offsetMs;
						if (browserMicrophoneStream) browserMicrophoneRecorder = browserWebcamRecorder;
					} else if (browserMicrophoneStream) {
						browserMicrophoneRecorder = createRecorderHandle(
							browserMicrophoneStream,
							{ mimeType: selectAudioMimeType(), audioBitsPerSecond: AUDIO_BITRATE_VOICE },
							`${RECORDING_FILE_PREFIX}${activeRecordingId}${MICROPHONE_FILE_SUFFIX}${VIDEO_FILE_EXTENSION}`,
						);
					}
					if (browserMicrophoneStream) microphoneOffsetMs = offsetMs;
				} catch (audioError) {
					browserMicrophoneStream?.getTracks().forEach((track) => track.stop());
					if (microphoneStream.current === browserMicrophoneStream) microphoneStream.current = null;
					await window.electronAPI.stopNativeWindowsRecording(true);
					throw audioError;
				}
			}
			if (!isCountdownRunActive(countdownRunToken)) {
				if (browserMicrophoneRecorder && browserMicrophoneRecorder.recorder.state !== "inactive") {
					browserMicrophoneRecorder.recorder.stop();
				}
				await browserMicrophoneRecorder?.discard().catch(() => undefined);
				browserMicrophoneStream?.getTracks().forEach((track) => track.stop());
				if (microphoneStream.current === browserMicrophoneStream) microphoneStream.current = null;
				if (browserWebcamRecorder && browserWebcamRecorder.recorder.state !== "inactive") {
					browserWebcamRecorder.recorder.stop();
				}
				await window.electronAPI.stopNativeWindowsRecording(true);
				return true;
			}

			recordingId.current = result.recordingId;
			nativeWindowsRecording.current = {
				recordingId: result.recordingId,
				finalizing: false,
				paused: false,
				webcamRecorder: browserWebcamRecorder,
				webcamOffsetMs,
				microphoneRecorder: browserMicrophoneRecorder,
				microphoneOffsetMs,
			};
			webcamRecorder.current = browserWebcamRecorder;
			accumulatedDurationMs.current = 0;
			segmentStartedAt.current = result.captureStartedAtMs ?? Date.now();
			allowAutoFinalize.current = true;
			setRecording(true);
			setPaused(false);
			setElapsedSeconds(0);
			return true;
		} catch (error) {
			console.error("Native Windows capture failed:", error);
			throw error;
		}
	};

	const startNativeMacRecordingIfAvailable = async (
		selectedSource: ProcessedDesktopSource,
		countdownRunToken?: number,
	) => {
		try {
			const platform = await window.electronAPI.getPlatform();
			if (platform !== "darwin") {
				return false;
			}

			const availability = await window.electronAPI.isNativeMacCaptureAvailable();
			if (!availability.success || !availability.available) {
				if (availability.reason === "unsupported-platform") {
					return false;
				}

				throw new Error(
					availability.reason === "missing-helper"
						? "Native macOS capture helper is not available."
						: (availability.error ?? "Native macOS capture is not available."),
				);
			}

			if (!isCountdownRunActive(countdownRunToken)) {
				return true;
			}

			const activeRecordingId = Date.now();
			const sourceType = selectedSource.id.startsWith("window:") ? "window" : "display";
			const displayId =
				Number(selectedSource.display_id) || parseMacDisplayIdFromSourceId(selectedSource.id);
			const windowId = parseMacWindowIdFromSourceId(selectedSource.id);
			let nativeWebcamRecorder: RecorderHandle | null = null;
			if (webcamEnabled) {
				if (!webcamReady.current) {
					await new Promise<void>((resolve) => {
						const interval = setInterval(() => {
							if (webcamReady.current) {
								clearInterval(interval);
								resolve();
							}
						}, 50);
						setTimeout(() => {
							clearInterval(interval);
							resolve();
						}, 5000);
					});
				}
				if (!isCountdownRunActive(countdownRunToken)) {
					return true;
				}
				if (webcamStream.current) {
					nativeWebcamRecorder = createRecorderHandle(webcamStream.current, {
						mimeType: selectMimeType(),
						videoBitsPerSecond: BITRATE_BASE,
					});
				} else {
					webcamAcquireId.current++;
				}
			}
			if (!isCountdownRunActive(countdownRunToken)) {
				if (nativeWebcamRecorder && nativeWebcamRecorder.recorder.state !== "inactive") {
					nativeWebcamRecorder.recorder.stop();
				}
				return true;
			}
			const request: NativeMacRecordingRequest = {
				schemaVersion: 1,
				recordingId: activeRecordingId,
				source: {
					type: sourceType,
					sourceId: selectedSource.id,
					...(displayId ? { displayId } : {}),
					...(windowId ? { windowId } : {}),
				},
				video: {
					fps: TARGET_FRAME_RATE,
					width: TARGET_WIDTH,
					height: TARGET_HEIGHT,
					bitrate: computeBitrate(TARGET_WIDTH, TARGET_HEIGHT),
					hideSystemCursor: cursorCaptureMode !== "system",
				},
				audio: {
					system: {
						enabled: systemAudioEnabled,
					},
					microphone: {
						enabled: microphoneEnabled,
						deviceId: microphoneDeviceId,
						deviceName: microphoneDeviceName,
						gain: microphoneGain,
					},
				},
				webcam: {
					enabled: webcamEnabled,
					deviceId: webcamDeviceId,
					deviceName: webcamDeviceName,
					width: 0,
					height: 0,
					fps: WEBCAM_TARGET_FRAME_RATE,
				},
				cursor: {
					mode: cursorCaptureMode,
				},
				outputs: {
					screenPath: "",
				},
			};
			const result = await window.electronAPI.startNativeMacRecording(request);
			if (!result.success || !result.recordingId) {
				if (nativeWebcamRecorder && nativeWebcamRecorder.recorder.state !== "inactive") {
					nativeWebcamRecorder.recorder.stop();
				}
				throw new Error(result.error ?? "Native macOS capture failed.");
			}
			if (!isCountdownRunActive(countdownRunToken)) {
				if (nativeWebcamRecorder && nativeWebcamRecorder.recorder.state !== "inactive") {
					nativeWebcamRecorder.recorder.stop();
				}
				await window.electronAPI.stopNativeMacRecording(true);
				return true;
			}

			recordingId.current = result.recordingId;
			nativeMacRecording.current = {
				recordingId: result.recordingId,
				finalizing: false,
				paused: false,
			};
			webcamRecorder.current = nativeWebcamRecorder;
			accumulatedDurationMs.current = 0;
			segmentStartedAt.current = Date.now();
			allowAutoFinalize.current = true;
			setRecording(true);
			setPaused(false);
			setElapsedSeconds(0);
			return true;
		} catch (error) {
			console.error("Native macOS capture failed:", error);
			throw error;
		}
	};

	const startRecordCountdown = async () => {
		if (countdownActive || recording || recordingStartInFlight.current) {
			return;
		}
		recordingStartInFlight.current = true;
		setCountdownActive(true);
		try {
			const runId = countdownRunId.current + 1;
			countdownRunId.current = runId;

			let selectedSource: ProcessedDesktopSource | null = null;
			try {
				selectedSource = await window.electronAPI.getSelectedSource();
			} catch (error) {
				console.warn("Failed to read selected source before countdown:", error);
			}

			if (!isCountdownRunActive(runId)) {
				return;
			}

			if (!selectedSource) {
				if (countdownRunId.current === runId) {
					setCountdownActive(false);
				}
				alert(t("recording.selectSource"));
				return;
			}

			try {
				const platform = await window.electronAPI.getPlatform();
				if (platform === "darwin" && cursorCaptureMode === "editable-overlay") {
					// The main process shows a native dialog that deep-links to the
					// Accessibility settings pane when access is missing, so we just stop
					// here and let the user grant it and press record again.
					const access = await window.electronAPI.requestNativeMacCursorAccess();
					if (!access.granted) {
						return;
					}
				}
			} catch (error) {
				console.warn("Failed to preflight macOS cursor accessibility before countdown:", error);
			}

			if (!isCountdownRunActive(runId)) {
				return;
			}

			setCountdownActive(true);

			let overlayHiddenBeforeStart = false;
			try {
				await window.electronAPI.prepareQuietRecording?.();
				if (webcamEnabled) await waitForWebcamReady();
				if (!isCountdownRunActive(runId)) return;
				const values = [3, 2, 1];
				const overlayShown = await safeShowCountdownOverlay(values[0], runId);

				if (countdownRunId.current !== runId) {
					return;
				}

				for (const value of values) {
					if (countdownRunId.current !== runId) {
						return;
					}

					if (overlayShown && value !== values[0]) {
						await safeSetCountdownOverlayValue(value, runId);

						if (countdownRunId.current !== runId) {
							return;
						}
					}

					await new Promise((resolve) => window.setTimeout(resolve, 1000));
				}

				if (countdownRunId.current !== runId) {
					return;
				}

				await safeHideCountdownOverlay(runId);
				overlayHiddenBeforeStart = true;

				if (countdownRunId.current !== runId) {
					return;
				}

				await startRecording(runId);
			} catch (error) {
				toast.error(error instanceof Error ? error.message : String(error));
			} finally {
				if (!overlayHiddenBeforeStart) {
					await safeHideCountdownOverlay(runId);
				}
			}
		} finally {
			if (
				!nativeWindowsRecording.current &&
				!nativeMacRecording.current &&
				!screenRecorder.current
			) {
				try {
					await window.electronAPI.releaseQuietRecording?.();
				} catch (error) {
					console.error("Quiet mode restoration failed:", error);
				}
			}
			recordingStartInFlight.current = false;
			setCountdownActive(false);
		}
	};

	const startRecording = async (countdownRunToken?: number) => {
		try {
			const selectedSource = await window.electronAPI.getSelectedSource();
			if (!selectedSource) {
				alert(t("recording.selectSource"));
				return;
			}

			if (!isCountdownRunActive(countdownRunToken)) {
				teardownMedia();
				return;
			}

			if (countdownRunToken === undefined) await window.electronAPI.prepareQuietRecording?.();
			if (!isCountdownRunActive(countdownRunToken)) {
				await window.electronAPI.releaseQuietRecording?.();
				teardownMedia();
				return;
			}
			if (await startNativeWindowsRecordingIfAvailable(selectedSource, countdownRunToken)) {
				return;
			}
			if (await startNativeMacRecordingIfAvailable(selectedSource, countdownRunToken)) {
				return;
			}

			let screenMediaStream: MediaStream;
			const platform = await window.electronAPI.getPlatform();

			if (platform === "win32") {
				if (cursorCaptureMode === "hidden") {
					throw new Error("Recording without a cursor requires native Windows capture.");
				}
				// getDisplayMedia + setDisplayMediaRequestHandler (main.ts) supplies the
				// pre-selected source. Editable cursor mode excludes the system cursor so
				// the editor can render a replacement; system mode bakes it into the video.
				screenMediaStream = await navigator.mediaDevices.getDisplayMedia({
					video: {
						cursor: cursorCaptureMode !== "system" ? "never" : "always",
						width: { max: TARGET_WIDTH },
						height: { max: TARGET_HEIGHT },
						frameRate: { ideal: TARGET_FRAME_RATE },
					} as MediaTrackConstraints,
					audio: systemAudioEnabled,
				} as DisplayMediaStreamOptions);
			} else {
				const videoConstraints = {
					mandatory: {
						chromeMediaSource: CHROME_MEDIA_SOURCE,
						chromeMediaSourceId: selectedSource.id,
						maxWidth: TARGET_WIDTH,
						maxHeight: TARGET_HEIGHT,
						maxFrameRate: TARGET_FRAME_RATE,
						minFrameRate: MIN_FRAME_RATE,
					},
				};

				if (systemAudioEnabled) {
					try {
						screenMediaStream = await navigator.mediaDevices.getUserMedia({
							audio: {
								mandatory: {
									chromeMediaSource: CHROME_MEDIA_SOURCE,
									chromeMediaSourceId: selectedSource.id,
								},
							},
							video: videoConstraints,
						} as unknown as MediaStreamConstraints);
					} catch (audioErr) {
						console.warn("System audio capture failed, falling back to video-only:", audioErr);
						toast.error(t("recording.systemAudioUnavailable"));
						screenMediaStream = await navigator.mediaDevices.getUserMedia({
							audio: false,
							video: videoConstraints,
						} as unknown as MediaStreamConstraints);
					}
				} else {
					screenMediaStream = await navigator.mediaDevices.getUserMedia({
						audio: false,
						video: videoConstraints,
					} as unknown as MediaStreamConstraints);
				}
			}
			screenStream.current = screenMediaStream;

			if (!isCountdownRunActive(countdownRunToken)) {
				teardownMedia();
				return;
			}

			if (microphoneEnabled) {
				try {
					microphoneStream.current = await navigator.mediaDevices.getUserMedia({
						audio: microphoneDeviceId
							? {
									deviceId: { exact: microphoneDeviceId },
									echoCancellation: true,
									noiseSuppression: true,
									autoGainControl: true,
								}
							: {
									echoCancellation: true,
									noiseSuppression: true,
									autoGainControl: true,
								},
						video: false,
					});
				} catch (audioError) {
					console.warn("Failed to get microphone access:", audioError);
					toast.error(t("recording.microphoneDenied"));
					setMicrophoneEnabled(false);
				}
			}

			if (!isCountdownRunActive(countdownRunToken)) {
				teardownMedia();
				return;
			}

			if (webcamEnabled) {
				if (!webcamReady.current) {
					await new Promise<void>((resolve) => {
						const interval = setInterval(() => {
							if (webcamReady.current) {
								clearInterval(interval);
								resolve();
							}
						}, 50);
						setTimeout(() => {
							clearInterval(interval);
							resolve();
						}, 5000);
					});
				}
				if (!webcamStream.current) {
					webcamAcquireId.current++;
				}
			}

			if (!isCountdownRunActive(countdownRunToken)) {
				teardownMedia();
				return;
			}

			stream.current = new MediaStream();
			const videoTrack = screenMediaStream.getVideoTracks()[0];
			if (!videoTrack) {
				throw new Error("Video track is not available.");
			}
			stream.current.addTrack(videoTrack);

			const systemAudioTrack = screenMediaStream.getAudioTracks()[0];
			const micAudioTrack = microphoneStream.current?.getAudioTracks()[0];

			if (systemAudioTrack && micAudioTrack) {
				const ctx = new AudioContext();
				mixingContext.current = ctx;
				const systemSource = ctx.createMediaStreamSource(new MediaStream([systemAudioTrack]));
				const micSource = ctx.createMediaStreamSource(new MediaStream([micAudioTrack]));
				const micGain = ctx.createGain();
				micGain.gain.value = microphoneGain;
				const destination = ctx.createMediaStreamDestination();
				systemSource.connect(destination);
				micSource.connect(micGain).connect(destination);
				stream.current.addTrack(destination.stream.getAudioTracks()[0]);
			} else if (systemAudioTrack) {
				stream.current.addTrack(systemAudioTrack);
			} else if (micAudioTrack) {
				stream.current.addTrack(micAudioTrack);
			}

			try {
				await videoTrack.applyConstraints({
					frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
					width: { ideal: TARGET_WIDTH, max: TARGET_WIDTH },
					height: { ideal: TARGET_HEIGHT, max: TARGET_HEIGHT },
				});
			} catch (constraintError) {
				console.warn(
					"Unable to lock 4K/60fps constraints, using best available track settings.",
					constraintError,
				);
			}

			if (!isCountdownRunActive(countdownRunToken)) {
				teardownMedia();
				return;
			}

			let {
				width = DEFAULT_WIDTH,
				height = DEFAULT_HEIGHT,
				frameRate = TARGET_FRAME_RATE,
			} = videoTrack.getSettings();

			width = Math.floor(width / CODEC_ALIGNMENT) * CODEC_ALIGNMENT;
			height = Math.floor(height / CODEC_ALIGNMENT) * CODEC_ALIGNMENT;

			const videoBitsPerSecond = computeBitrate(width, height);
			const mimeType = selectMimeType();

			console.log(
				`Recording at ${width}x${height} @ ${frameRate ?? TARGET_FRAME_RATE}fps using ${mimeType} / ${Math.round(
					videoBitsPerSecond / BITS_PER_MEGABIT,
				)} Mbps`,
			);

			const hasAudio = stream.current.getAudioTracks().length > 0;
			if (!isCountdownRunActive(countdownRunToken)) {
				teardownMedia();
				return;
			}

			recordingId.current = Date.now();
			const activeRecordingId = recordingId.current;
			screenRecorder.current = createRecorderHandle(
				stream.current,
				{
					mimeType,
					videoBitsPerSecond,
					...(hasAudio
						? { audioBitsPerSecond: systemAudioTrack ? AUDIO_BITRATE_SYSTEM : AUDIO_BITRATE_VOICE }
						: {}),
				},
				`${RECORDING_FILE_PREFIX}${activeRecordingId}${VIDEO_FILE_EXTENSION}`,
			);
			screenRecorder.current.recorder.addEventListener(
				"error",
				() => {
					setRecording(false);
				},
				{ once: true },
			);

			if (webcamStream.current) {
				webcamRecorder.current = createRecorderHandle(
					webcamStream.current,
					{ mimeType, videoBitsPerSecond: Math.min(videoBitsPerSecond, BITRATE_BASE) },
					`${RECORDING_FILE_PREFIX}${activeRecordingId}${WEBCAM_FILE_SUFFIX}${VIDEO_FILE_EXTENSION}`,
				);
			}

			accumulatedDurationMs.current = 0;
			segmentStartedAt.current = Date.now();
			allowAutoFinalize.current = true;
			setRecording(true);
			setPaused(false);
			setElapsedSeconds(0);
			window.electronAPI?.setRecordingState(true, recordingId.current, cursorCaptureMode);

			const activeScreenRecorder = screenRecorder.current;
			const activeWebcamRecorder = webcamRecorder.current;
			if (activeScreenRecorder) {
				activeScreenRecorder.recorder.addEventListener(
					"stop",
					() => {
						if (!allowAutoFinalize.current) {
							return;
						}
						finalizeRecording(
							activeScreenRecorder,
							activeWebcamRecorder ?? null,
							Math.max(0, getRecordingDurationMs()),
							activeRecordingId,
						);
					},
					{ once: true },
				);
			}
		} catch (error) {
			console.error("Failed to start recording:", error);
			const errorMsg = error instanceof Error ? error.message : "Failed to start recording";
			if (errorMsg.includes("Permission denied") || errorMsg.includes("NotAllowedError")) {
				toast.error(t("recording.permissionDenied"));
			} else {
				toast.error(errorMsg);
			}
			setRecording(false);
			setPaused(false);
			setElapsedSeconds(0);
			accumulatedDurationMs.current = 0;
			segmentStartedAt.current = null;
			screenRecorder.current = null;
			webcamRecorder.current = null;
			teardownMedia();
		} finally {
			if (
				!nativeWindowsRecording.current &&
				!nativeMacRecording.current &&
				!screenRecorder.current
			) {
				await window.electronAPI
					.releaseQuietRecording?.()
					.catch((error) => console.error("Quiet mode restoration failed:", error));
			}
		}
	};

	const togglePaused = () => {
		const activeNativeWindowsRecording = nativeWindowsRecording.current;
		if (activeNativeWindowsRecording && !activeNativeWindowsRecording.finalizing) {
			if (pauseToggleInFlight.current) return;
			pauseToggleInFlight.current = true;
			void (async () => {
				const activeMicrophoneRecorder = activeNativeWindowsRecording.microphoneRecorder?.recorder;
				const activeWebcamRecorder = activeNativeWindowsRecording.webcamRecorder?.recorder;
				try {
					if (activeNativeWindowsRecording.paused) {
						const result = await window.electronAPI.resumeNativeWindowsRecording();
						if (!result.success) {
							throw new Error(result.error ?? "Failed to resume native Windows recording");
						}
						if (activeMicrophoneRecorder?.state === "paused") {
							activeMicrophoneRecorder.resume();
						}
						if (activeWebcamRecorder?.state === "paused") {
							activeWebcamRecorder.resume();
						}
						activeNativeWindowsRecording.paused = false;
						segmentStartedAt.current = Date.now();
						setPaused(false);
						return;
					}

					const pausedAtMs = getRecordingDurationMs();
					const result = await window.electronAPI.pauseNativeWindowsRecording();
					if (!result.success) {
						throw new Error(result.error ?? "Failed to pause native Windows recording");
					}
					if (activeMicrophoneRecorder?.state === "recording") {
						activeMicrophoneRecorder.pause();
					}
					if (activeWebcamRecorder?.state === "recording") {
						activeWebcamRecorder.pause();
					}
					activeNativeWindowsRecording.paused = true;
					accumulatedDurationMs.current = pausedAtMs;
					segmentStartedAt.current = null;
					setElapsedSeconds(Math.floor(accumulatedDurationMs.current / 1000));
					setPaused(true);
				} catch (error) {
					console.error("Failed to toggle native Windows pause state:", error);
					toast.error(error instanceof Error ? error.message : "Failed to toggle pause state");
				} finally {
					pauseToggleInFlight.current = false;
				}
			})();
			return;
		}

		const activeNativeMacRecording = nativeMacRecording.current;
		if (activeNativeMacRecording && !activeNativeMacRecording.finalizing) {
			if (pauseToggleInFlight.current) return;
			pauseToggleInFlight.current = true;
			void (async () => {
				const activeWebcamRecorder = webcamRecorder.current?.recorder;
				try {
					if (activeNativeMacRecording.paused) {
						const result = await window.electronAPI.resumeNativeMacRecording();
						if (!result.success) {
							throw new Error(result.error ?? "Failed to resume native macOS recording");
						}
						if (activeWebcamRecorder?.state === "paused") {
							activeWebcamRecorder.resume();
						}
						activeNativeMacRecording.paused = false;
						segmentStartedAt.current = Date.now();
						setPaused(false);
						return;
					}

					const pausedAtMs = getRecordingDurationMs();
					const result = await window.electronAPI.pauseNativeMacRecording();
					if (!result.success) {
						throw new Error(result.error ?? "Failed to pause native macOS recording");
					}
					if (activeWebcamRecorder?.state === "recording") {
						activeWebcamRecorder.pause();
					}
					activeNativeMacRecording.paused = true;
					accumulatedDurationMs.current = pausedAtMs;
					segmentStartedAt.current = null;
					setElapsedSeconds(Math.floor(accumulatedDurationMs.current / 1000));
					setPaused(true);
				} catch (error) {
					console.error("Failed to toggle native macOS pause state:", error);
					toast.error(error instanceof Error ? error.message : "Failed to toggle pause state");
				} finally {
					pauseToggleInFlight.current = false;
				}
			})();
			return;
		}

		const activeScreenRecorder = screenRecorder.current?.recorder;
		if (!activeScreenRecorder || activeScreenRecorder.state === "inactive") {
			return;
		}

		const activeWebcamRecorder = webcamRecorder.current?.recorder;

		if (activeScreenRecorder.state === "paused") {
			try {
				activeScreenRecorder.resume();
				void window.electronAPI
					.setLiveBlurPaused?.(false)
					.catch((error) => console.error("Could not resume live blur:", error));
				if (activeWebcamRecorder?.state === "paused") {
					activeWebcamRecorder.resume();
				}
				segmentStartedAt.current = Date.now();
				setPaused(false);
			} catch (error) {
				console.error("Failed to resume recording:", error);
			}
			return;
		}

		if (activeScreenRecorder.state !== "recording") {
			return;
		}

		try {
			accumulatedDurationMs.current = getRecordingDurationMs();
			segmentStartedAt.current = null;
			setElapsedSeconds(Math.floor(accumulatedDurationMs.current / 1000));
			activeScreenRecorder.pause();
			void window.electronAPI
				.setLiveBlurPaused?.(true)
				.catch((error) => console.error("Could not pause live blur:", error));
			if (activeWebcamRecorder?.state === "recording") {
				activeWebcamRecorder.pause();
			}
			setPaused(true);
		} catch (error) {
			console.error("Failed to pause recording:", error);
		}
	};

	const toggleRecording = () => {
		if (recording) {
			stopRecording.current();
			return;
		}

		if (countdownActive) {
			cancelCountdown();
			return;
		}

		void startRecordCountdown();
	};
	toggleRecordingFromShortcut.current = toggleRecording;
	togglePauseFromShortcut.current = togglePaused;

	const restartRecording = async () => {
		if (restarting.current) return;

		if (nativeWindowsRecording.current) {
			const activeRecordingId = recordingId.current;
			restarting.current = true;
			discardRecordingId.current = activeRecordingId;
			try {
				await finalizeNativeWindowsRecording(true);
				if (!nativeWindowsRecording.current) await startRecording();
			} finally {
				restarting.current = false;
			}
			return;
		}
		if (nativeMacRecording.current) {
			const activeRecordingId = recordingId.current;
			restarting.current = true;
			discardRecordingId.current = activeRecordingId;
			try {
				await finalizeNativeMacRecording(true);
				await startRecording();
			} finally {
				restarting.current = false;
			}
			return;
		}

		const activeScreenRecorder = screenRecorder.current;
		if (!activeScreenRecorder || activeScreenRecorder.recorder.state === "inactive") return;

		const activeWebcamRecorder = webcamRecorder.current;
		const activeRecordingId = recordingId.current;

		restarting.current = true;
		discardRecordingId.current = activeRecordingId;

		const stopPromises = [
			new Promise<void>((resolve) => {
				activeScreenRecorder.recorder.addEventListener("stop", () => resolve(), { once: true });
			}),
		];

		if (
			activeWebcamRecorder?.recorder.state === "recording" ||
			activeWebcamRecorder?.recorder.state === "paused"
		) {
			stopPromises.push(
				new Promise<void>((resolve) => {
					activeWebcamRecorder.recorder.addEventListener("stop", () => resolve(), {
						once: true,
					});
				}),
			);
		}

		stopRecording.current();
		await Promise.all(stopPromises);

		try {
			await startRecording();
		} finally {
			restarting.current = false;
		}
	};

	useEffect(() => {
		if (!recording) {
			setElapsedSeconds(0);
			return;
		}

		setElapsedSeconds(Math.floor(getRecordingDurationMs() / 1000));
		if (paused) {
			return;
		}

		const interval = window.setInterval(() => {
			setElapsedSeconds(Math.floor(getRecordingDurationMs() / 1000));
		}, 250);

		return () => window.clearInterval(interval);
	}, [getRecordingDurationMs, paused, recording]);

	const cancelRecording = () => {
		if (nativeWindowsRecording.current) {
			const activeRecordingId = recordingId.current;
			discardRecordingId.current = activeRecordingId;
			allowAutoFinalize.current = false;
			void finalizeNativeWindowsRecording(true);
			return;
		}
		if (nativeMacRecording.current) {
			const activeRecordingId = recordingId.current;
			discardRecordingId.current = activeRecordingId;
			allowAutoFinalize.current = false;
			void finalizeNativeMacRecording(true);
			return;
		}

		const activeScreenRecorder = screenRecorder.current;
		if (
			activeScreenRecorder?.recorder.state === "recording" ||
			activeScreenRecorder?.recorder.state === "paused"
		) {
			const activeRecordingId = recordingId.current;
			discardRecordingId.current = activeRecordingId;
			allowAutoFinalize.current = false;

			stopRecording.current();
			return;
		}

		if (countdownActive) {
			cancelCountdown();
			return;
		}
	};

	return {
		recording,
		countdownActive,
		paused,
		elapsedSeconds,
		toggleRecording,
		togglePaused,
		canPauseRecording,
		restartRecording,
		cancelRecording,
		microphoneEnabled,
		setMicrophoneEnabled: selectMicrophoneEnabled,
		microphoneGain,
		setMicrophoneGain: selectMicrophoneGain,
		microphoneDeviceId,
		setMicrophoneDeviceId: selectMicrophoneDeviceId,
		microphoneDeviceName,
		setMicrophoneDeviceName: selectMicrophoneDeviceName,
		webcamDeviceId,
		setWebcamDeviceId: selectWebcamDeviceId,
		webcamDeviceName,
		setWebcamDeviceName: selectWebcamDeviceName,
		systemAudioEnabled,
		setSystemAudioEnabled: selectSystemAudioEnabled,
		webcamEnabled,
		setWebcamEnabled,
		cursorCaptureMode,
		setCursorCaptureMode: selectCursorCaptureMode,
	};
}
