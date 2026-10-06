import fs from "node:fs/promises";
import { fixParsedWebmDuration } from "@fix-webm-duration/fix";
import { WebmFile } from "@fix-webm-duration/parser";

/**
 * Where the file's media actually ends compared with the duration we are about to write.
 * MediaRecorder clusters span at most a few seconds, so a last cluster that starts well past
 * the declared duration means the track kept recording while the session was paused (the
 * webcam-through-pause bug fixed in 1.10.25). Patching the header would hide that drift.
 */
export interface WebmTimelineCheck {
	lastClusterMs: number;
	declaredMs: number;
	overrunMs: number;
	mismatch: boolean;
}

export type DurationPatchResult = (
	| { patched: true }
	| { patched: false; reason: "no-section" | "already-valid" | "io-error" | "internal" }
) & { timeline?: WebmTimelineCheck };

/** Last cluster may start up to this long before the true end without indicating drift. */
export const WEBM_TIMELINE_TOLERANCE_MS = 5_000;

const CLUSTER_ID = [0x1f, 0x43, 0xb6, 0x75];
const TIMECODE_ID = 0xe7;

function readVint(bytes: Uint8Array, offset: number): { value: number; length: number } | null {
	const first = bytes[offset];
	if (first === undefined || first === 0) return null;
	let length = 1;
	while (length <= 8 && (first & (0x80 >> (length - 1))) === 0) length++;
	if (length > 8 || offset + length > bytes.length) return null;
	let value = first & (0xff >> length);
	for (let i = 1; i < length; i++) value = value * 256 + bytes[offset + i];
	return { value, length };
}

/**
 * Timecode (ms, assuming MediaRecorder's default 1 ms TimecodeScale) of the last Cluster in a
 * WebM byte stream, or null when no parsable cluster is found. Scans backwards so it stays cheap
 * on long recordings.
 */
export function findLastClusterTimecodeMs(bytes: Uint8Array): number | null {
	for (let i = bytes.length - 4; i >= 0; i--) {
		if (
			bytes[i] !== CLUSTER_ID[0] ||
			bytes[i + 1] !== CLUSTER_ID[1] ||
			bytes[i + 2] !== CLUSTER_ID[2] ||
			bytes[i + 3] !== CLUSTER_ID[3]
		) {
			continue;
		}
		const size = readVint(bytes, i + 4);
		if (!size) continue;
		const childOffset = i + 4 + size.length;
		if (bytes[childOffset] !== TIMECODE_ID) continue;
		const timecodeSize = readVint(bytes, childOffset + 1);
		if (!timecodeSize || timecodeSize.value < 1 || timecodeSize.value > 8) continue;
		const valueOffset = childOffset + 1 + timecodeSize.length;
		if (valueOffset + timecodeSize.value > bytes.length) continue;
		let timecode = 0;
		for (let b = 0; b < timecodeSize.value; b++) timecode = timecode * 256 + bytes[valueOffset + b];
		return timecode;
	}
	return null;
}

export function checkWebmTimeline(
	bytes: Uint8Array,
	declaredMs: number,
): WebmTimelineCheck | undefined {
	const lastClusterMs = findLastClusterTimecodeMs(bytes);
	if (lastClusterMs === null) return undefined;
	const overrunMs = lastClusterMs - declaredMs;
	return { lastClusterMs, declaredMs, overrunMs, mismatch: overrunMs > WEBM_TIMELINE_TOLERANCE_MS };
}

/**
 * Patch the WebM Duration header on a finalized recording file.
 *
 * MediaRecorder writes WebM with no Duration EBML element, and the streaming-to-disk
 * path never holds the blob so the old `fixWebmDuration(blob, durationMs)` can't run.
 * Patching on disk after `WriteStream.end()` gives the editor a real duration instead of `N/A`.
 *
 * Atomic: writes to `<filePath>.duration-patch.tmp` and renames in place, so a mid-rewrite
 * crash leaves the original intact. Best-effort: any read/parse/write failure logs and returns
 * a non-`patched` result rather than throwing; the file still plays without the patch (decoders
 * walk frames sequentially), only the seek bar and timeline break.
 *
 * Reads the whole file into a main-process Buffer, off the renderer so it dodges V8's heap cap.
 */
export async function patchWebmDurationOnDisk(
	filePath: string,
	durationMs: number,
): Promise<DurationPatchResult> {
	try {
		const fileBytes = await fs.readFile(filePath);
		const timeline = checkWebmTimeline(new Uint8Array(fileBytes), durationMs);
		if (timeline?.mismatch) {
			console.warn(
				`[webm-duration] ${filePath} media runs to ${timeline.lastClusterMs}ms but the session is ${durationMs}ms; the track may have recorded through a pause`,
			);
		}
		const webm = new WebmFile(new Uint8Array(fileBytes));

		const patched = fixParsedWebmDuration(webm, durationMs, { logger: false });
		if (!patched) {
			// false means missing Segment, missing Info, or an already-valid Duration.
			// The first two mean a malformed (likely truncated) file; the third is a no-op.
			const reason = inferUnpatchedReason(webm);
			if (reason === "no-section") {
				console.warn(
					`[webm-duration] no Segment/Info section in ${filePath}; file may be truncated`,
				);
			}
			return { patched: false, reason, timeline };
		}

		if (!webm.source) {
			console.error(`[webm-duration] patched but source missing for ${filePath}`);
			return { patched: false, reason: "internal", timeline };
		}

		const tmpPath = `${filePath}.duration-patch.tmp`;
		const patchedBytes = Buffer.from(
			webm.source.buffer,
			webm.source.byteOffset,
			webm.source.byteLength,
		);
		try {
			await fs.writeFile(tmpPath, patchedBytes);
			await fs.rename(tmpPath, filePath);
			return { patched: true, timeline };
		} catch (writeError) {
			console.error(`[webm-duration] failed to write patched ${filePath}:`, writeError);
			// Clean up the temp file; the original is untouched since the rename never ran.
			await fs.unlink(tmpPath).catch(() => undefined);
			return { patched: false, reason: "io-error", timeline };
		}
	} catch (error) {
		console.error(`[webm-duration] failed to patch ${filePath}:`, error);
		return { patched: false, reason: "io-error" };
	}
}

/**
 * Distinguish "no Segment/Info section" (malformed/truncated file) from "Info present
 * but Duration already valid" (patch unnecessary).
 *
 * The IDs are the length-descriptor-stripped form @fix-webm-duration/parser uses as lookup
 * keys (Segment `0x8538067`, Info `0x549a966`), per the parser's `src/lib/sections.js`, not
 * the canonical 4-byte EBML IDs (`0x18538067` / `0x1549A966`) that `getSectionById` never matches.
 */
function inferUnpatchedReason(webm: WebmFile): "no-section" | "already-valid" {
	const segment = webm.getSectionById?.(0x8538067);
	if (!segment) return "no-section";
	const info = (
		segment as unknown as { getSectionById?: (id: number) => unknown }
	).getSectionById?.(0x549a966);
	return info ? "already-valid" : "no-section";
}
