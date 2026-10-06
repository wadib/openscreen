import { useCallback, useEffect, useState } from "react";
import type { RecordingPreviewSettings } from "@/lib/recordingPreview";
import { acquireRecordingPreviewCapture, type PreviewCapture } from "@/lib/recordingPreviewCapture";
import { useWebcamRecordingPreview } from "./useWebcamRecordingPreview";

type PreviewSource = Pick<ProcessedDesktopSource, "id" | "name">;

export function useRecordingPreview() {
	const [source, setSource] = useState<PreviewSource | null>(null);
	const [settings, setSettings] = useState<RecordingPreviewSettings | null>(null);
	const [capture, setCapture] = useState<{
		sourceId: string;
		cursor: string;
		stream: MediaStream;
	} | null>(null);
	const [unavailable, setUnavailable] = useState(false);
	const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
	const [retryId, setRetryId] = useState(0);
	const [visible, setVisible] = useState(() => !document.hidden);
	const sourceId = source?.id;
	const cursor = settings?.cursorCaptureMode === "hidden" ? "never" : "always";
	const ready = settings !== null;
	const retry = useCallback(() => setRetryId((value) => value + 1), []);
	const webcam = useWebcamRecordingPreview(
		Boolean(settings?.webcamEnabled && visible),
		retryId,
		settings?.webcamStreamId,
	);

	useEffect(() => {
		let disposed = false;
		let changed = false;
		const unsubscribe = window.electronAPI.onRecordingPreviewSettingsChanged((next) => {
			changed = true;
			setSettings(next);
		});
		void window.electronAPI
			.getRecordingPreviewSettings()
			.then((next) => {
				if (!disposed && !changed) setSettings(next);
			})
			.catch(() => {
				if (!disposed && !changed) setUnavailable(true);
			});
		return () => {
			disposed = true;
			unsubscribe();
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		let changed = false;
		const unsubscribe = window.electronAPI.onRecordingPreviewSourceChanged((next) => {
			changed = true;
			setSource(next);
			setUnavailable(false);
		});
		void window.electronAPI
			.getSelectedSource()
			.then((next) => {
				if (!cancelled && !changed) setSource(next?.id ? { id: next.id, name: next.name } : null);
			})
			.catch(() => {
				if (!cancelled && !changed) setUnavailable(true);
			});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, []);

	useEffect(() => {
		let nativeVisible = true;
		let changed = false;
		let cancelled = false;
		const updateVisibility = () => setVisible(nativeVisible && !document.hidden);
		const unsubscribe = window.electronAPI.onRecordingPreviewVisibilityChanged((next) => {
			changed = true;
			nativeVisible = next;
			updateVisibility();
		});
		void window.electronAPI
			.getRecordingPreviewState()
			.then((state) => {
				if (cancelled || changed) return;
				nativeVisible = state.visible;
				updateVisibility();
			})
			.catch(() => undefined);
		document.addEventListener("visibilitychange", updateVisibility);
		return () => {
			cancelled = true;
			unsubscribe();
			document.removeEventListener("visibilitychange", updateVisibility);
		};
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Retry must reacquire the same source.
	useEffect(() => {
		let cancelled = false;
		let acquired: PreviewCapture | null = null;
		const controller = new AbortController();
		setCapture(null);
		setSourceSize(null);
		setUnavailable(false);
		if (!sourceId || !visible || !ready) return;
		const failed = () => {
			if (cancelled) return;
			acquired?.stop();
			setCapture(null);
			setUnavailable(true);
		};
		void acquireRecordingPreviewCapture({ sourceId, cursor }, failed, controller.signal, (next) => {
			if (!cancelled)
				setSourceSize((previous) =>
					previous?.width === next.width && previous.height === next.height ? previous : next,
				);
		})
			.then((handle) => {
				if (cancelled) {
					handle.stop();
					return;
				}
				acquired = handle;
				const media = handle.stream;
				if (!media.getVideoTracks().length) {
					handle.stop();
					setUnavailable(true);
					return;
				}
				for (const track of media.getVideoTracks()) {
					track.onended = () => {
						if (cancelled) return;
						handle.stop();
						setCapture(null);
						setUnavailable(true);
					};
				}
				setCapture({ sourceId, cursor, stream: media });
			})
			.catch(() => {
				if (!cancelled) setUnavailable(true);
			});
		return () => {
			cancelled = true;
			controller.abort();
			acquired?.stop();
		};
	}, [sourceId, cursor, visible, retryId, ready]);

	const stream =
		capture && capture.sourceId === sourceId && capture.cursor === cursor ? capture.stream : null;
	return {
		source,
		stream,
		sourceSize,
		unavailable,
		retry,
		webcam,
		webcamEnabled: Boolean(settings?.webcamEnabled),
		paused: Boolean(settings?.paused),
	};
}
