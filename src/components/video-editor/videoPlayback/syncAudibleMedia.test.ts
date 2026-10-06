import { describe, expect, it, vi } from "vitest";
import { syncAudibleMedia } from "./syncAudibleMedia";

function media(currentTime = 10) {
	return {
		currentTime,
		playbackRate: 1,
		paused: false,
		ended: false,
		seeking: false,
		readyState: 4,
		play: vi.fn().mockResolvedValue(undefined),
		pause: vi.fn(),
	};
}

describe("audible media clock", () => {
	it("corrects small drift without seeking or restarting audible playback", () => {
		const audio = media(9.94);
		syncAudibleMedia(media(), audio, 8);
		expect(audio.currentTime).toBe(9.94);
		expect(audio.playbackRate).toBeGreaterThan(1);
		expect(audio.playbackRate).toBeLessThanOrEqual(1.05);
		expect(audio.play).not.toHaveBeenCalled();
	});
	it("slows a leading track without resetting its buffers", () => {
		const audio = media(10.08);
		syncAudibleMedia(media(), audio, 0);
		expect(audio.currentTime).toBe(10.08);
		expect(audio.playbackRate).toBeLessThan(1);
	});
	it("seeks timeline jumps with the saved offset", () => {
		const audio = media(2);
		syncAudibleMedia(media(), audio, 100, true);
		expect(audio.currentTime).toBe(9.9);
	});
	it("waits until a pending audio seek completes", () => {
		const audio = { ...media(2), seeking: true };
		syncAudibleMedia(media(), audio, 0);
		expect(audio.currentTime).toBe(2);
		expect(audio.play).not.toHaveBeenCalled();
	});
	it("pauses and aligns the sidecar when the screen pauses", () => {
		const audio = media(9.9);
		syncAudibleMedia({ ...media(), paused: true }, audio, 0);
		expect(audio.pause).toHaveBeenCalled();
		expect(audio.currentTime).toBe(10);
		expect(audio.play).not.toHaveBeenCalled();
	});
	it("holds positive-offset audio until its start and preserves edited speed", () => {
		const audio = media(0);
		syncAudibleMedia(media(0.01), audio, 100);
		expect(audio.pause).toHaveBeenCalled();
		expect(audio.play).not.toHaveBeenCalled();
		syncAudibleMedia({ ...media(), playbackRate: 2 }, audio, 0);
		expect(audio.playbackRate).toBe(2);
	});
});
