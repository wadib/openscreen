import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadRecordingPreferences } from "@/lib/recordingPreferences";
import { useScreenRecorder } from "./useScreenRecorder";

const { error } = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error } }));
vi.mock("@/contexts/I18nContext", () => {
	const translate = (key: string) => key;
	return { useScopedT: () => translate };
});
vi.mock("@/lib/requestCameraAccess", () => ({
	requestCameraAccess: vi.fn().mockResolvedValue({ success: true, granted: true }),
}));
vi.mock("./useRecordingPreviewHost", () => ({ useRecordingPreviewHost: vi.fn() }));
const displayMedia = vi.fn();
const availability = vi.fn();
const nativeStop = vi.fn();
const nativeStart = vi.fn();
const recordingState = vi.fn();
const prepareQuiet = vi.fn();
const releaseQuiet = vi.fn();
const userMedia = vi.fn();
beforeEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
	nativeStop.mockReset();
	nativeStart.mockReset().mockResolvedValue({ success: true, recordingId: 123 });
	prepareQuiet.mockReset().mockResolvedValue(undefined);
	releaseQuiet.mockReset().mockResolvedValue(undefined);
	recordingState.mockResolvedValue(undefined);
	vi.useFakeTimers();
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
	userMedia.mockReset().mockImplementation(async () => {
		const track = { stop: vi.fn(), onended: null };
		return { getTracks: () => [track], getVideoTracks: () => [track] };
	});
	vi.stubGlobal("navigator", {
		mediaDevices: { getDisplayMedia: displayMedia, getUserMedia: userMedia },
	});
	vi.stubGlobal("electronAPI", {
		getPlatform: vi.fn().mockResolvedValue("win32"),
		getSelectedSource: vi.fn().mockResolvedValue({ id: "window:1", name: "Test" }),
		isNativeWindowsCaptureAvailable: availability,
		startNativeWindowsRecording: nativeStart,
		stopNativeWindowsRecording: nativeStop,
		setRecordingState: recordingState,
		setCurrentVideoPath: vi.fn().mockResolvedValue(undefined),
		finishRecording: vi.fn().mockResolvedValue(undefined),
		prepareQuietRecording: prepareQuiet,
		releaseQuietRecording: releaseQuiet,
		showCountdownOverlay: vi.fn().mockResolvedValue(undefined),
		hideCountdownOverlay: vi.fn().mockResolvedValue(undefined),
		setCountdownOverlayValue: vi.fn().mockResolvedValue(undefined),
	});
});
afterEach(async () => {
	cleanup();
	await act(async () => {
		await Promise.resolve();
	});
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
it("restores selected recording options and devices when the recorder is recreated", async () => {
	const first = renderHook(useScreenRecorder);
	await act(async () => {
		first.result.current.setMicrophoneEnabled(true);
		first.result.current.setSystemAudioEnabled(true);
		first.result.current.setMicrophoneDeviceId("preferred-mic");
		first.result.current.setMicrophoneDeviceName("USB microphone");
		first.result.current.setWebcamDeviceId("preferred-camera");
		first.result.current.setWebcamDeviceName("USB webcam");
		first.result.current.setCursorCaptureMode("hidden");
		await first.result.current.setWebcamEnabled(true);
	});
	first.unmount();
	const second = renderHook(useScreenRecorder);
	await act(async () => {
		await Promise.resolve();
	});
	expect(second.result.current).toMatchObject({
		microphoneEnabled: true,
		systemAudioEnabled: true,
		webcamEnabled: true,
		microphoneDeviceId: "preferred-mic",
		microphoneDeviceName: "USB microphone",
		webcamDeviceId: "preferred-camera",
		webcamDeviceName: "USB webcam",
		cursorCaptureMode: "hidden",
	});
	expect(userMedia).toHaveBeenLastCalledWith(
		expect.objectContaining({
			video: expect.objectContaining({ deviceId: { exact: "preferred-camera" } }),
		}),
	);
	await act(async () => {
		second.result.current.setMicrophoneEnabled(false);
		second.result.current.setSystemAudioEnabled(false);
		await second.result.current.setWebcamEnabled(false);
	});
	second.unmount();
	const third = renderHook(useScreenRecorder);
	expect(third.result.current).toMatchObject({
		microphoneEnabled: false,
		systemAudioEnabled: false,
		webcamEnabled: false,
		webcamDeviceId: "preferred-camera",
	});
});

it("keeps the saved webcam selection after a temporary acquisition failure", async () => {
	const first = renderHook(useScreenRecorder);
	await act(async () => {
		await first.result.current.setWebcamEnabled(true);
	});
	first.unmount();
	userMedia.mockRejectedValueOnce(new DOMException("Camera busy", "NotReadableError"));
	const second = renderHook(useScreenRecorder);
	await act(async () => {
		await Promise.resolve();
	});
	expect(second.result.current.webcamEnabled).toBe(true);
	expect(loadRecordingPreferences().webcamEnabled).toBe(true);
	second.unmount();
	const third = renderHook(useScreenRecorder);
	await act(async () => {
		await Promise.resolve();
	});
	expect(third.result.current.webcamEnabled).toBe(true);
});

it.each([
	"missing-helper",
	"unsupported-os",
])("never records a browser cursor when cursor is hidden and native capture is %s", async (reason) => {
	availability.mockResolvedValue({ success: true, available: false, reason });
	const { result } = renderHook(useScreenRecorder);
	act(() => result.current.setCursorCaptureMode("hidden"));
	act(() => result.current.toggleRecording());
	await act(async () => {
		await vi.advanceTimersByTimeAsync(4_000);
	});
	expect(error).toHaveBeenCalledWith("Recording without a cursor requires native Windows capture.");
	expect(displayMedia).not.toHaveBeenCalled();
	expect(result.current.recording).toBe(false);
});

async function startNativeRecording() {
	availability.mockResolvedValue({ success: true, available: true });
	const hook = renderHook(useScreenRecorder);
	act(() => hook.result.current.toggleRecording());
	await act(async () => {
		await vi.advanceTimersByTimeAsync(4000);
	});
	expect(hook.result.current.recording).toBe(true);
	return hook;
}

it("shows 3, 2, 1 and hides the countdown before native recording starts", async () => {
	availability.mockResolvedValue({ success: true, available: true });
	const { result } = renderHook(useScreenRecorder);
	act(() => result.current.toggleRecording());
	await act(async () => {
		await vi.advanceTimersByTimeAsync(0);
	});
	expect(window.electronAPI.showCountdownOverlay).toHaveBeenCalledWith(3, 1);
	expect(nativeStart).not.toHaveBeenCalled();
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1000);
	});
	expect(window.electronAPI.setCountdownOverlayValue).toHaveBeenLastCalledWith(2, 1);
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1000);
	});
	expect(window.electronAPI.setCountdownOverlayValue).toHaveBeenLastCalledWith(1, 1);
	expect(nativeStart).not.toHaveBeenCalled();
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1000);
	});
	expect(window.electronAPI.hideCountdownOverlay).toHaveBeenCalledWith(1);
	expect(nativeStart).toHaveBeenCalledOnce();
	expect(
		vi.mocked(window.electronAPI.hideCountdownOverlay).mock.invocationCallOrder[0],
	).toBeLessThan(nativeStart.mock.invocationCallOrder[0]);
});

it("cancels the visible countdown without starting native capture", async () => {
	availability.mockResolvedValue({ success: true, available: true });
	const { result } = renderHook(useScreenRecorder);
	act(() => result.current.toggleRecording());
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1000);
	});
	act(() => result.current.toggleRecording());
	await act(async () => {
		await vi.advanceTimersByTimeAsync(4000);
	});
	expect(window.electronAPI.hideCountdownOverlay).toHaveBeenCalledWith(1);
	expect(nativeStart).not.toHaveBeenCalled();
	expect(result.current.recording).toBe(false);
});

it("finishes quiet preparation before showing the three-second countdown", async () => {
	let ready!: () => void;
	prepareQuiet.mockReturnValue(
		new Promise<void>((resolve) => {
			ready = resolve;
		}),
	);
	availability.mockResolvedValue({ success: true, available: true });
	const { result } = renderHook(useScreenRecorder);
	act(() => result.current.toggleRecording());
	await act(async () => {
		await vi.advanceTimersByTimeAsync(5000);
	});
	expect(result.current.countdownActive).toBe(true);
	expect(window.electronAPI.showCountdownOverlay).not.toHaveBeenCalled();
	expect(nativeStart).not.toHaveBeenCalled();
	await act(async () => {
		ready();
		await vi.advanceTimersByTimeAsync(0);
	});
	expect(window.electronAPI.showCountdownOverlay).toHaveBeenCalledWith(3, 1);
	await act(async () => {
		await vi.advanceTimersByTimeAsync(3000);
	});
	expect(prepareQuiet).toHaveBeenCalledOnce();
	expect(nativeStart).toHaveBeenCalledOnce();
	expect(result.current.recording).toBe(true);
});

it("cancels preparation and restores quiet mode without recording", async () => {
	let ready!: () => void;
	prepareQuiet.mockReturnValue(
		new Promise<void>((resolve) => {
			ready = resolve;
		}),
	);
	const { result } = renderHook(useScreenRecorder);
	act(() => result.current.toggleRecording());
	await act(async () => {
		await vi.advanceTimersByTimeAsync(0);
	});
	act(() => result.current.toggleRecording());
	await act(async () => {
		ready();
		await vi.advanceTimersByTimeAsync(4000);
	});
	expect(nativeStart).not.toHaveBeenCalled();
	expect(window.electronAPI.showCountdownOverlay).not.toHaveBeenCalled();
	expect(releaseQuiet).toHaveBeenCalled();
	expect(result.current.countdownActive).toBe(false);
});

it("keeps startup busy and discards a canceled native start without duplicate capture", async () => {
	let started!: (result: { success: boolean; recordingId: number }) => void;
	nativeStart.mockReturnValue(
		new Promise((resolve) => {
			started = resolve;
		}),
	);
	nativeStop.mockResolvedValue({ success: true, stopped: true });
	availability.mockResolvedValue({ success: true, available: true });
	const { result } = renderHook(useScreenRecorder);
	act(() => result.current.toggleRecording());
	await act(async () => {
		await vi.advanceTimersByTimeAsync(3000);
	});
	expect(result.current.countdownActive).toBe(true);
	expect(nativeStart).toHaveBeenCalledOnce();
	act(() => result.current.toggleRecording());
	act(() => result.current.toggleRecording());
	await act(async () => {
		started({ success: true, recordingId: 123 });
		await vi.advanceTimersByTimeAsync(0);
	});
	expect(nativeStop).toHaveBeenCalledWith(true);
	expect(nativeStart).toHaveBeenCalledOnce();
	expect(result.current.recording).toBe(false);
	expect(result.current.countdownActive).toBe(false);
	expect(releaseQuiet).toHaveBeenCalled();
});

it("does not start countdown or capture when quiet preparation fails", async () => {
	prepareQuiet.mockRejectedValue(new Error("Quiet preparation failed"));
	const { result } = renderHook(useScreenRecorder);
	act(() => result.current.toggleRecording());
	await act(async () => {
		await vi.advanceTimersByTimeAsync(4000);
	});
	expect(window.electronAPI.showCountdownOverlay).not.toHaveBeenCalled();
	expect(nativeStart).not.toHaveBeenCalled();
	expect(error).toHaveBeenCalledWith("Quiet preparation failed");
	expect(result.current.countdownActive).toBe(false);
});

it("clears the recorder after a failed save when native capture has stopped", async () => {
	nativeStop.mockResolvedValue({
		success: false,
		stopped: true,
		error: "Output could not be finalized",
	});
	const { result } = await startNativeRecording();
	await act(async () => result.current.toggleRecording());
	expect(result.current.recording).toBe(false);
	expect(result.current.paused).toBe(false);
	expect(result.current.elapsedSeconds).toBe(0);
	expect(recordingState).toHaveBeenCalledWith(false);
	expect(error).toHaveBeenCalledWith("Output could not be finalized");
	act(() => result.current.toggleRecording());
	await act(async () => {
		await vi.advanceTimersByTimeAsync(4000);
	});
	expect(nativeStart).toHaveBeenCalledTimes(2);
});

it("clears a stale native recording without trying to open an empty session", async () => {
	nativeStop.mockResolvedValue({ success: true, stopped: true });
	const { result } = await startNativeRecording();
	await act(async () => result.current.toggleRecording());
	expect(result.current.recording).toBe(false);
	expect(error).not.toHaveBeenCalled();
});

it("retains Stop for retry when the backend cannot confirm capture ended", async () => {
	nativeStop.mockResolvedValueOnce({ success: false, stopped: false, error: "Still running" });
	const { result } = await startNativeRecording();
	await act(async () => result.current.toggleRecording());
	expect(result.current.recording).toBe(true);
	expect(result.current.canPauseRecording).toBe(true);
	nativeStop.mockResolvedValue({ success: true, stopped: true });
	await act(async () => result.current.toggleRecording());
	expect(result.current.recording).toBe(false);
	expect(nativeStop).toHaveBeenCalledTimes(2);
});

it("opens Studio only after a pending writer finishes successfully on retry", async () => {
	nativeStop.mockResolvedValueOnce({ success: false, stopped: false, error: "Still finalizing" });
	const { result } = await startNativeRecording();
	await act(async () => result.current.toggleRecording());
	expect(result.current.recording).toBe(true);
	expect(window.electronAPI.finishRecording).not.toHaveBeenCalled();
	nativeStop.mockResolvedValueOnce({ success: true, path: "recording.mp4" });
	await act(async () => result.current.toggleRecording());
	expect(result.current.recording).toBe(false);
	expect(window.electronAPI.setCurrentVideoPath).toHaveBeenCalledWith("recording.mp4");
	expect(window.electronAPI.finishRecording).toHaveBeenCalledOnce();
});

it("does not clear the controls when Cancel cannot stop native capture", async () => {
	nativeStop.mockResolvedValue({ success: false, stopped: false, error: "Still running" });
	const { result } = await startNativeRecording();
	await act(async () => result.current.cancelRecording());
	expect(result.current.recording).toBe(true);
	expect(error).toHaveBeenCalledWith("Still running");
});
