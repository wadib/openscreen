import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireRecordingPreviewCapture } from "./recordingPreviewCapture";

let receive: (frame: {
	captureId: string;
	imageDataUrl?: string;
	unavailable?: boolean;
	sourceWidth?: number;
	sourceHeight?: number;
}) => void;
const start = vi.fn();
const stop = vi.fn();
const unsubscribe = vi.fn();
const draw = vi.fn();
const stopTrack = vi.fn();
const captureStream = vi.fn();
class PreviewImage {
	naturalWidth = 640;
	naturalHeight = 360;
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	set src(value: string) {
		if (value) queueMicrotask(() => this.onload?.());
	}
}
beforeEach(() => {
	vi.clearAllMocks();
	start.mockResolvedValue({ success: true });
	stop.mockResolvedValue(undefined);
	captureStream.mockReturnValue({ getTracks: () => [{ stop: stopTrack }] });
	vi.stubGlobal("Image", PreviewImage);
	vi.stubGlobal("electronAPI", {
		startRecordingPreviewCapture: start,
		stopRecordingPreviewCapture: stop,
		onRecordingPreviewFrame: (callback: typeof receive) => {
			receive = callback;
			return unsubscribe;
		},
	});
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		drawImage: draw,
	} as unknown as CanvasRenderingContext2D);
	Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
		configurable: true,
		value: captureStream,
	});
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).captureStream;
});
describe("native preview frame lifecycle", () => {
	it("reports original source size separately from downsampled preview size", async () => {
		const onSize = vi.fn();
		const promise = acquireRecordingPreviewCapture(
			{ sourceId: "window:1", cursor: "never" },
			vi.fn(),
			new AbortController().signal,
			onSize,
		);
		receive({
			captureId: start.mock.calls[0][0],
			imageDataUrl: "data:image/png;base64,AA==",
			sourceWidth: 3840,
			sourceHeight: 2160,
		});
		const capture = await promise;
		expect(onSize).toHaveBeenCalledWith({ width: 3840, height: 2160 });
		capture.stop();
	});
	it("ignores another capture's frames and stops only its own capture once", async () => {
		const unavailable = vi.fn();
		const promise = acquireRecordingPreviewCapture(
			{ sourceId: "window:1", cursor: "never" },
			unavailable,
			new AbortController().signal,
		);
		receive({ captureId: "other", imageDataUrl: "data:image/png;base64,AA==" });
		expect(draw).not.toHaveBeenCalled();
		const id = start.mock.calls[0][0];
		receive({ captureId: id, imageDataUrl: "data:image/png;base64,AA==" });
		const capture = await promise;
		expect(captureStream).toHaveBeenCalledWith(15);
		capture.stop();
		capture.stop();
		expect(stopTrack).toHaveBeenCalledOnce();
		expect(stop).toHaveBeenCalledExactlyOnceWith(id);
		expect(unsubscribe).toHaveBeenCalledOnce();
		expect(unavailable).not.toHaveBeenCalled();
	});
	it("closes a capture whose start response arrives after cancellation", async () => {
		let resolveStart!: (result: { success: boolean }) => void;
		start.mockReturnValue(
			new Promise((resolve) => {
				resolveStart = resolve;
			}),
		);
		const aborted = new AbortController();
		const unavailable = vi.fn();
		const promise = acquireRecordingPreviewCapture(
			{ sourceId: "window:1", cursor: "never" },
			unavailable,
			aborted.signal,
		);
		aborted.abort();
		await expect(promise).rejects.toMatchObject({ name: "AbortError" });
		resolveStart({ success: true });
		await Promise.resolve();
		expect(stop).toHaveBeenCalledTimes(2);
		expect(stop.mock.calls[0]).toEqual(stop.mock.calls[1]);
		expect(unavailable).not.toHaveBeenCalled();
	});
	it("releases the capture if canvas frame rendering fails", async () => {
		draw.mockImplementationOnce(() => {
			throw new Error("Lost canvas");
		});
		const unavailable = vi.fn();
		const promise = acquireRecordingPreviewCapture(
			{ sourceId: "window:1", cursor: "never" },
			unavailable,
			new AbortController().signal,
		);
		receive({ captureId: start.mock.calls[0][0], imageDataUrl: "data:image/png;base64,AA==" });
		await expect(promise).rejects.toThrow("Native preview unavailable");
		expect(unsubscribe).toHaveBeenCalledOnce();
		expect(stop).toHaveBeenCalledOnce();
		expect(unavailable).toHaveBeenCalledOnce();
	});
});
