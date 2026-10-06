export function shiftRegionsToSidecar<T extends { startMs: number; endMs: number }>(
	regions: T[] | undefined,
	offsetMs = 0,
): T[] | undefined {
	return regions
		?.map((region) => ({
			...region,
			startMs: Math.max(0, region.startMs - offsetMs),
			endMs: Math.max(0, region.endMs - offsetMs),
		}))
		.filter((region) => region.endMs > region.startMs);
}
