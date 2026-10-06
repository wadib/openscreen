import { describe, expect, it } from "vitest";
import {
	mergeRecordingSession,
	normalizeCursorCaptureMode,
	normalizeRecordingSession,
} from "./recordingSession";

describe("cursor capture modes", () => {
	it.each([
		"editable-overlay",
		"system",
		"hidden",
	])("retains %s through a recording session", (mode) => {
		expect(normalizeCursorCaptureMode(mode)).toBe(mode);
		expect(
			normalizeRecordingSession({
				screenVideoPath: "recording.mp4",
				cursorCaptureMode: mode,
				createdAt: 1,
			})?.cursorCaptureMode,
		).toBe(mode);
	});
	it("does not interpret unknown modes as hidden", () => {
		expect(normalizeCursorCaptureMode("off")).toBeUndefined();
	});
});

describe("microphone track sessions", () => {
	it("preserves the shared webcam/microphone path and timing through project normalization", () => {
		expect(
			normalizeRecordingSession({
				screenVideoPath: "screen.mp4",
				webcamVideoPath: "camera-and-microphone.webm",
				microphoneAudioPath: "camera-and-microphone.webm",
				webcamOffsetMs: 46,
				microphoneOffsetMs: 46,
				createdAt: 1,
			}),
		).toMatchObject({
			webcamVideoPath: "camera-and-microphone.webm",
			microphoneAudioPath: "camera-and-microphone.webm",
			webcamOffsetMs: 46,
			microphoneOffsetMs: 46,
		});
	});
	it("preserves the microphone track when a webcam is attached later", () => {
		const base = normalizeRecordingSession({
			screenVideoPath: "recording.mp4",
			microphoneAudioPath: "recording-microphone.wav",
			microphoneOffsetMs: 0,
			microphoneGain: 1,
			createdAt: 1,
		});
		expect(base).not.toBeNull();

		expect(
			mergeRecordingSession(base, {
				screenVideoPath: "recording.mp4",
				webcamVideoPath: "recording-webcam.webm",
				createdAt: 1,
			}),
		).toMatchObject({
			webcamVideoPath: "recording-webcam.webm",
			microphoneAudioPath: "recording-microphone.wav",
			microphoneOffsetMs: 0,
			microphoneGain: 1,
		});
	});

	it("preserves microphone timing and mix controls", () => {
		expect(
			normalizeRecordingSession({
				screenVideoPath: "recording.mp4",
				microphoneAudioPath: "recording-microphone.wav",
				microphoneOffsetMs: 125,
				microphoneGain: 1.25,
				microphoneMuted: true,
				createdAt: 1,
			}),
		).toMatchObject({
			microphoneAudioPath: "recording-microphone.wav",
			microphoneOffsetMs: 125,
			microphoneGain: 1.25,
			microphoneMuted: true,
		});
	});

	it("clamps unsafe microphone control values", () => {
		const session = normalizeRecordingSession({
			screenVideoPath: "recording.mp4",
			microphoneOffsetMs: 99_999,
			microphoneGain: -5,
			createdAt: 1,
		});
		expect(session?.microphoneOffsetMs).toBe(30_000);
		expect(session?.microphoneGain).toBe(0);
	});
});
