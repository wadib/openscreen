import { describe, expect, it } from "vitest";
import { normalizeCursorCaptureMode, normalizeRecordingSession } from "./recordingSession";

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
