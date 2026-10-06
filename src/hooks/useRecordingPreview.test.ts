import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRecordingPreview } from "./useRecordingPreview";

vi.mock("@/lib/recordingPreviewCapture", () => ({
	acquireRecordingPreviewCapture: (...args: unknown[]) =>
		capture(...args).then((stream: MediaStream) => {
			let stopped = false;
			return {
				stream,
				stop: () => {
					if (stopped) return;
					stopped = true;
					stream.getTracks().forEach((track) => {
						track.onended = null;
						track.stop();
					});
				},
			};
		}),
}));

const source = { id: "window:123:0", name: "Test window" };
let changeSource: (next: typeof source | null) => void;
let changeVisibility: (visible: boolean) => void;
let changeSettings: (settings: {
	cursorCaptureMode: "hidden" | "system" | "editable-overlay";
	webcamEnabled: boolean;
	paused: boolean;
}) => void;
const capture = vi.fn();
const selected = vi.fn();
const unsubscribe = vi.fn();
function media() {
	const track = { stop: vi.fn(), onended: null as (() => void) | null };
	const stream = {
		getTracks: () => [track],
		getVideoTracks: () => [track],
	} as unknown as MediaStream;
	return { track, stream };
}
beforeEach(() => {
	vi.clearAllMocks();
	selected.mockResolvedValue(source);
	vi.stubGlobal("electronAPI", {
		getSelectedSource: selected,
		getRecordingPreviewSettings: vi.fn().mockResolvedValue({
			cursorCaptureMode: "editable-overlay",
			webcamEnabled: false,
			paused: false,
		}),
		onRecordingPreviewSettingsChanged: (callback: typeof changeSettings) => {
			changeSettings = callback;
			return vi.fn();
		},
		getRecordingPreviewState: vi.fn().mockResolvedValue({ visible: true }),
		onRecordingPreviewVisibilityChanged: (callback: typeof changeVisibility) => {
			changeVisibility = callback;
			return vi.fn();
		},
		onRecordingPreviewSourceChanged: (callback: typeof changeSource) => {
			changeSource = callback;
			return unsubscribe;
		},
	});
	vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: capture } });
	vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("recording preview", () => {
	it("reacquires capture without cursor when the mouse toggle is off", async () => {
		const first = media();
		const second = media();
		const third = media();
		capture
			.mockResolvedValueOnce(first.stream)
			.mockResolvedValueOnce(second.stream)
			.mockResolvedValueOnce(third.stream);
		const { result } = renderHook(useRecordingPreview);
		await waitFor(() => expect(result.current.stream).toBe(first.stream));
		act(() => changeSettings({ cursorCaptureMode: "hidden", webcamEnabled: false, paused: false }));
		await waitFor(() => expect(result.current.stream).toBe(second.stream));
		expect(first.track.stop).toHaveBeenCalledOnce();
		expect(capture.mock.calls[1][0].cursor).toBe("never");
		act(() => changeSettings({ cursorCaptureMode: "system", webcamEnabled: false, paused: false }));
		await waitFor(() => expect(result.current.stream).toBe(third.stream));
		expect(capture.mock.calls[2][0].cursor).toBe("always");
	});
	it("reports pause state without restarting preview capture", async () => {
		const input = media();
		capture.mockResolvedValue(input.stream);
		const { result } = renderHook(useRecordingPreview);
		await waitFor(() => expect(result.current.stream).toBe(input.stream));
		act(() =>
			changeSettings({
				cursorCaptureMode: "editable-overlay",
				webcamEnabled: false,
				paused: true,
			}),
		);
		expect(result.current.paused).toBe(true);
		expect(capture).toHaveBeenCalledOnce();
	});
	it("honors native minimize events even when document visibility stays visible", async () => {
		const first = media();
		const second = media();
		capture.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
		const { result } = renderHook(useRecordingPreview);
		await waitFor(() => expect(result.current.stream).toBe(first.stream));
		act(() => changeVisibility(false));
		expect(result.current.stream).toBeNull();
		expect(first.track.stop).toHaveBeenCalledOnce();
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		expect(result.current.stream).toBeNull();
		act(() => changeVisibility(true));
		await waitFor(() => expect(result.current.stream).toBe(second.stream));
	});
	it("captures muted low-resolution video without recording or requesting audio", async () => {
		const input = media();
		capture.mockResolvedValue(input.stream);
		const { result, unmount } = renderHook(useRecordingPreview);
		await waitFor(() => expect(result.current.stream).toBe(input.stream));
		expect(capture).toHaveBeenCalledWith(
			{ sourceId: source.id, cursor: "always" },
			expect.any(Function),
			expect.any(AbortSignal),
			expect.any(Function),
		);
		unmount();
		expect(input.track.stop).toHaveBeenCalledOnce();
		expect(unsubscribe).toHaveBeenCalledOnce();
	});
	it("does not capture without a selected source", async () => {
		selected.mockResolvedValue(null);
		const { result } = renderHook(useRecordingPreview);
		await act(() => Promise.resolve());
		expect(result.current.stream).toBeNull();
		expect(capture).not.toHaveBeenCalled();
	});
	it("releases the previous stream when the source changes", async () => {
		const first = media();
		const second = media();
		capture.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
		const { result } = renderHook(useRecordingPreview);
		await waitFor(() => expect(result.current.stream).toBe(first.stream));
		act(() => changeSource({ id: "window:456:0", name: "Other window" }));
		await waitFor(() => expect(result.current.stream).toBe(second.stream));
		expect(first.track.stop).toHaveBeenCalledOnce();
	});
	it("stops a late capture response after closing", async () => {
		const input = media();
		let resolve!: (value: MediaStream) => void;
		capture.mockImplementationOnce(
			() =>
				new Promise<MediaStream>((done) => {
					resolve = done;
				}),
		);
		const { unmount } = renderHook(useRecordingPreview);
		await waitFor(() => expect(capture).toHaveBeenCalledOnce());
		unmount();
		await act(async () => resolve(input.stream));
		expect(input.track.stop).toHaveBeenCalledOnce();
	});
	it("discards a late response for an old source", async () => {
		const first = media();
		const second = media();
		let resolve!: (value: MediaStream) => void;
		capture
			.mockImplementationOnce(
				() =>
					new Promise<MediaStream>((done) => {
						resolve = done;
					}),
			)
			.mockResolvedValueOnce(second.stream);
		const { result } = renderHook(useRecordingPreview);
		await waitFor(() => expect(capture).toHaveBeenCalledOnce());
		act(() => changeSource({ id: "window:456:0", name: "Other window" }));
		await waitFor(() => expect(result.current.stream).toBe(second.stream));
		await act(async () => resolve(first.stream));
		expect(first.track.stop).toHaveBeenCalledOnce();
		expect(result.current.stream).toBe(second.stream);
	});
	it("shows a capture failure and retries only the selected source", async () => {
		const input = media();
		capture.mockRejectedValueOnce(new Error("Capture failed")).mockResolvedValueOnce(input.stream);
		const { result } = renderHook(useRecordingPreview);
		await waitFor(() => expect(result.current.unavailable).toBe(true));
		expect(capture).toHaveBeenCalledOnce();
		act(() => result.current.retry());
		await waitFor(() => expect(result.current.stream).toBe(input.stream));
		expect(result.current.unavailable).toBe(false);
	});
	it("clears stale frames and stops tracks when the source ends", async () => {
		const input = media();
		capture.mockResolvedValue(input.stream);
		const { result } = renderHook(useRecordingPreview);
		await waitFor(() => expect(result.current.stream).toBe(input.stream));
		act(() => input.track.onended?.());
		expect(result.current.stream).toBeNull();
		expect(result.current.unavailable).toBe(true);
		expect(input.track.stop).toHaveBeenCalledOnce();
	});
	it("releases capture while minimized and reconnects when restored", async () => {
		const first = media();
		const second = media();
		capture.mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
		const { result } = renderHook(useRecordingPreview);
		await waitFor(() => expect(result.current.stream).toBe(first.stream));
		vi.spyOn(document, "hidden", "get").mockReturnValue(true);
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		expect(result.current.stream).toBeNull();
		expect(first.track.stop).toHaveBeenCalledOnce();
		vi.spyOn(document, "hidden", "get").mockReturnValue(false);
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		await waitFor(() => expect(result.current.stream).toBe(second.stream));
	});
	it("does not let initial source lookup override a newer selection", async () => {
		let resolve!: (value: typeof source) => void;
		selected.mockImplementationOnce(
			() =>
				new Promise<typeof source>((done) => {
					resolve = done;
				}),
		);
		const input = media();
		capture.mockResolvedValue(input.stream);
		const { result } = renderHook(useRecordingPreview);
		act(() => changeSource({ id: "window:456:0", name: "New selection" }));
		await act(async () => resolve(source));
		await waitFor(() => expect(result.current.stream).toBe(input.stream));
		expect(result.current.source?.id).toBe("window:456:0");
	});
});
