import type { CursorCaptureMode } from "./recordingSession";

export const RECORDING_PREFERENCES_KEY = "openscreen_recording_preferences_v1";

export interface RecordingPreferences {
	microphoneEnabled: boolean;
	systemAudioEnabled: boolean;
	webcamEnabled: boolean;
	cursorCaptureMode: CursorCaptureMode;
	microphoneDeviceId?: string;
	microphoneDeviceName?: string;
	webcamDeviceId?: string;
	webcamDeviceName?: string;
}

const defaults: RecordingPreferences = {
	microphoneEnabled: false,
	systemAudioEnabled: false,
	webcamEnabled: false,
	cursorCaptureMode: "editable-overlay",
};

export function loadRecordingPreferences(): RecordingPreferences {
	const result = { ...defaults };
	try {
		const saved = JSON.parse(localStorage.getItem(RECORDING_PREFERENCES_KEY) ?? "null");
		if (!saved || typeof saved !== "object") return result;
		for (const key of ["microphoneEnabled", "systemAudioEnabled", "webcamEnabled"] as const) {
			if (typeof saved[key] === "boolean") result[key] = saved[key];
		}
		if (["editable-overlay", "system", "hidden"].includes(saved.cursorCaptureMode)) {
			result.cursorCaptureMode = saved.cursorCaptureMode;
		}
		for (const key of [
			"microphoneDeviceId",
			"microphoneDeviceName",
			"webcamDeviceId",
			"webcamDeviceName",
		] as const) {
			if (typeof saved[key] === "string" && saved[key]) result[key] = saved[key];
		}
	} catch {
		// Missing or corrupt preferences must not prevent recording.
	}
	return result;
}

export function saveRecordingPreferences(update: Partial<RecordingPreferences>): void {
	try {
		localStorage.setItem(
			RECORDING_PREFERENCES_KEY,
			JSON.stringify({ ...loadRecordingPreferences(), ...update }),
		);
	} catch {
		// Recording remains usable if storage is unavailable.
	}
}
