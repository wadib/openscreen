export interface PreviewCapture {
	stream: MediaStream;
	stop: () => void;
}

export function acquireRecordingPreviewCapture(
	options: { sourceId: string; cursor: string },
	onUnavailable: () => void,
	signal: AbortSignal,
	onSourceSize?: (size: { width: number; height: number }) => void,
): Promise<PreviewCapture> {
	return new Promise((resolve, reject) => {
		const id = crypto.randomUUID();
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		if (!context) {
			reject(new Error("Preview canvas unavailable"));
			return;
		}
		let stream: MediaStream | null = null;
		let stopped = false;
		let busy = false;
		let image: HTMLImageElement | null = null;
		let timeout: ReturnType<typeof setTimeout>;
		const stop = () => {
			if (stopped) return;
			stopped = true;
			clearTimeout(timeout);
			unsubscribe();
			signal.removeEventListener("abort", aborted);
			if (image) {
				image.onload = null;
				image.onerror = null;
				image.src = "";
			}
			stream?.getTracks().forEach((track) => track.stop());
			void window.electronAPI.stopRecordingPreviewCapture(id).catch(() => undefined);
		};
		const fail = () => {
			if (stopped) return;
			stop();
			reject(new Error("Native preview unavailable"));
			onUnavailable();
		};
		const aborted = () => {
			stop();
			reject(new DOMException("Preview closed", "AbortError"));
		};
		const unsubscribe = window.electronAPI.onRecordingPreviewFrame((frame) => {
			if (frame.captureId !== id || stopped) return;
			if (frame.unavailable) {
				fail();
				return;
			}
			if (!frame.imageDataUrl || busy) return;
			busy = true;
			image = new Image();
			image.onload = () => {
				if (stopped || !image) return;
				try {
					canvas.width = image.naturalWidth;
					canvas.height = image.naturalHeight;
					const sourceWidth = frame.sourceWidth ?? image.naturalWidth;
					const sourceHeight = frame.sourceHeight ?? image.naturalHeight;
					if (
						Number.isFinite(sourceWidth) &&
						Number.isFinite(sourceHeight) &&
						sourceWidth > 0 &&
						sourceHeight > 0
					)
						onSourceSize?.({ width: sourceWidth, height: sourceHeight });
					context.drawImage(image, 0, 0);
					busy = false;
					if (!stream) {
						stream = canvas.captureStream(15);
						clearTimeout(timeout);
						resolve({ stream, stop });
					}
				} catch {
					fail();
				}
			};
			image.onerror = fail;
			image.src = frame.imageDataUrl;
		});
		timeout = setTimeout(fail, 15_000);
		signal.addEventListener("abort", aborted, { once: true });
		if (signal.aborted) {
			aborted();
			return;
		}
		void window.electronAPI
			.startRecordingPreviewCapture(id, options.sourceId)
			.then((result) => {
				if (stopped) {
					void window.electronAPI.stopRecordingPreviewCapture(id).catch(() => undefined);
					return;
				}
				if (!result.success) fail();
			})
			.catch(fail);
	});
}
