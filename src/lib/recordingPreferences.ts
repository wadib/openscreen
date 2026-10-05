import type { CursorCaptureMode } from "./recordingSession";

export const RECORDING_PREFERENCES_KEY = "openscreen_recording_preferences_v1";

export interface RecordingSourcePreference {
	id: string;
	name: string;
	displayId: string;
}

export interface RecordingPreferences {
	microphoneEnabled: boolean;
	microphoneGain: number;
	systemAudioEnabled: boolean;
	webcamEnabled: boolean;
	previewEnabled: boolean;
	blurryEnabled: boolean;
	cursorCaptureMode: CursorCaptureMode;
	selectedSource?: RecordingSourcePreference;
	microphoneDeviceId?: string;
	microphoneDeviceName?: string;
	webcamDeviceId?: string;
	webcamDeviceName?: string;
}

const defaults: RecordingPreferences = {
	microphoneEnabled: false,
	microphoneGain: 1,
	systemAudioEnabled: false,
	webcamEnabled: false,
	previewEnabled: false,
	blurryEnabled: false,
	cursorCaptureMode: "editable-overlay",
};

export function loadRecordingPreferences(): RecordingPreferences {
	const result = { ...defaults };
	try {
		const saved = JSON.parse(localStorage.getItem(RECORDING_PREFERENCES_KEY) ?? "null");
		if (!saved || typeof saved !== "object") return result;
		for (const key of [
			"microphoneEnabled",
			"systemAudioEnabled",
			"webcamEnabled",
			"previewEnabled",
			"blurryEnabled",
		] as const) {
			if (typeof saved[key] === "boolean") result[key] = saved[key];
		}
		if (typeof saved.microphoneGain === "number" && Number.isFinite(saved.microphoneGain)) {
			result.microphoneGain = Math.min(2, Math.max(0, saved.microphoneGain));
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
		const source = saved.selectedSource;
		if (
			source &&
			typeof source === "object" &&
			typeof source.id === "string" &&
			source.id &&
			typeof source.name === "string" &&
			source.name &&
			typeof source.displayId === "string"
		) {
			result.selectedSource = {
				id: source.id,
				name: source.name,
				displayId: source.displayId,
			};
		}
	} catch {
		// Missing or corrupt preferences must not prevent recording.
	}
	return result;
}

export function findRestorableRecordingSource<
	T extends {
		id: string;
		name: string;
		display_id: string;
	},
>(sources: T[], preferred: RecordingSourcePreference | undefined): T | undefined {
	if (!preferred) return undefined;
	const exact = sources.find((source) => source.id === preferred.id);
	if (exact) return exact;
	if (preferred.id.startsWith("screen:")) {
		return sources.find(
			(source) =>
				source.id.startsWith("screen:") &&
				((preferred.displayId && source.display_id === preferred.displayId) ||
					source.name === preferred.name),
		);
	}
	return sources.find(
		(source) => source.id.startsWith("window:") && source.name === preferred.name,
	);
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
