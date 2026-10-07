import { afterEach, describe, expect, it } from "vitest";
import { defaultCrisperWhisperUrl, loadCleanupSettings } from "./useSpeechTools";

describe("CrisperWhisper server address", () => {
	afterEach(() => localStorage.clear());

	it("uses the local server on Linux and the Tailscale name elsewhere", () => {
		expect(defaultCrisperWhisperUrl("Mozilla/5.0 (X11; Linux x86_64) Electron/41")).toBe(
			"http://127.0.0.1:8090/",
		);
		expect(defaultCrisperWhisperUrl("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/41")).toBe(
			"http://omarchy:8090/",
		);
	});

	it("moves the old 8080 address to the new default and keeps custom ones", () => {
		localStorage.setItem(
			"openscreen_cleanup_settings",
			JSON.stringify({ fillers: "crisperwhisper", serverUrl: "http://192.168.86.250:8080/" }),
		);
		expect(loadCleanupSettings().serverUrl).toBe(defaultCrisperWhisperUrl());
		localStorage.setItem(
			"openscreen_cleanup_settings",
			JSON.stringify({ serverUrl: "http://my-box:9000/" }),
		);
		expect(loadCleanupSettings().serverUrl).toBe("http://my-box:9000/");
	});
});
