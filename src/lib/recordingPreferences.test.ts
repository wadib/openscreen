import { beforeEach, expect, it, vi } from "vitest";
import {
	loadRecordingPreferences,
	RECORDING_PREFERENCES_KEY,
	saveRecordingPreferences,
} from "./recordingPreferences";

beforeEach(() => localStorage.clear());

it("merges changes without resetting other recording choices", () => {
	saveRecordingPreferences({ microphoneEnabled: true, webcamDeviceId: "camera-2" });
	saveRecordingPreferences({ systemAudioEnabled: true, cursorCaptureMode: "system" });
	expect(loadRecordingPreferences()).toMatchObject({
		microphoneEnabled: true,
		systemAudioEnabled: true,
		webcamDeviceId: "camera-2",
		cursorCaptureMode: "system",
	});
	saveRecordingPreferences({ webcamDeviceId: undefined });
	expect(loadRecordingPreferences().webcamDeviceId).toBeUndefined();
});

it.each([
	"broken json",
	"null",
	"42",
	JSON.stringify({ microphoneEnabled: "true", cursorCaptureMode: "invalid", webcamDeviceId: 4 }),
])("safely loads invalid preferences: %s", (value) => {
	localStorage.setItem(RECORDING_PREFERENCES_KEY, value);
	expect(loadRecordingPreferences()).toEqual({
		microphoneEnabled: false,
		systemAudioEnabled: false,
		webcamEnabled: false,
		cursorCaptureMode: "editable-overlay",
	});
});

it("does not fail when persistent storage is blocked", () => {
	const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
		throw new Error("Blocked");
	});
	const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new Error("Blocked");
	});
	try {
		expect(() => saveRecordingPreferences({ webcamEnabled: true })).not.toThrow();
		expect(loadRecordingPreferences().webcamEnabled).toBe(false);
	} finally {
		read.mockRestore();
		write.mockRestore();
	}
});
