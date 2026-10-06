type MediaClock = Pick<
	HTMLMediaElement,
	"currentTime" | "playbackRate" | "paused" | "ended" | "seeking"
>;
type AudibleMedia = MediaClock & Pick<HTMLMediaElement, "play" | "pause" | "readyState">;

export function syncAudibleMedia(
	video: MediaClock,
	audio: AudibleMedia,
	offsetMs: number,
	forceSeek = false,
) {
	const targetTime = Math.max(0, video.currentTime - offsetMs / 1000);
	const error = targetTime - audio.currentTime;
	const paused = video.paused || video.ended || video.currentTime < offsetMs / 1000;
	if (paused) audio.pause();
	if (audio.readyState < 1 || audio.seeking) return;

	// Seeking flushes audible buffers. Reserve it for timeline jumps, not clock jitter.
	const needsSeek = forceSeek || paused || audio.paused || Math.abs(error) > 0.25;
	if (needsSeek && Math.abs(error) > 0.015) audio.currentTime = targetTime;
	const correction =
		needsSeek || Math.abs(error) < 0.01 ? 0 : Math.max(-0.05, Math.min(0.05, error * 0.5));
	audio.playbackRate = video.playbackRate * (1 + correction);
	if (!paused && audio.paused) audio.play().catch(() => undefined);
}
