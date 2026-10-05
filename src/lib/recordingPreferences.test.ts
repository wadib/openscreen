import { beforeEach, expect, it, vi } from "vitest";
import {
	findRestorableRecordingSource,
	loadRecordingPreferences,
	RECORDING_PREFERENCES_KEY,
	saveRecordingPreferences,
} from "./recordingPreferences";

beforeEach(() => localStorage.clear());

it("merges changes without resetting other recording choices", () => {
	saveRecordingPreferences({
		microphoneEnabled: true,
		microphoneGain: 1.25,
		webcamDeviceId: "camera-2",
		previewEnabled: true,
		blurryEnabled: true,
		selectedSource: { id: "screen:1:0", name: "Display 1", displayId: "1" },
	});
	saveRecordingPreferences({ systemAudioEnabled: true, cursorCaptureMode: "system" });
	expect(loadRecordingPreferences()).toMatchObject({
		microphoneEnabled: true,
		microphoneGain: 1.25,
		systemAudioEnabled: true,
		webcamDeviceId: "camera-2",
		previewEnabled: true,
		blurryEnabled: true,
		selectedSource: { id: "screen:1:0", name: "Display 1", displayId: "1" },
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
		microphoneGain: 1,
		systemAudioEnabled: false,
		webcamEnabled: false,
		previewEnabled: false,
		blurryEnabled: false,
		cursorCaptureMode: "editable-overlay",
	});
});

it("clamps persisted microphone gain to the supported range", () => {
	saveRecordingPreferences({ microphoneGain: 4 });
	expect(loadRecordingPreferences().microphoneGain).toBe(2);
	saveRecordingPreferences({ microphoneGain: -1 });
	expect(loadRecordingPreferences().microphoneGain).toBe(0);
});

it("restores sources by id, display id, then window name", () => {
	const sources = [
		{ id: "screen:9:0", name: "Display 1", display_id: "1" },
		{ id: "window:22:0", name: "Notes", display_id: "" },
	];
	expect(
		findRestorableRecordingSource(sources, {
			id: "screen:1:0",
			name: "Old display name",
			displayId: "1",
		}),
	).toBe(sources[0]);
	expect(
		findRestorableRecordingSource(sources, {
			id: "window:10:0",
			name: "Notes",
			displayId: "",
		}),
	).toBe(sources[1]);
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
