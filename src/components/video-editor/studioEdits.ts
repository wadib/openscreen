import type { EditorState } from "@/hooks/useEditorHistory";
import type { StudioArguments } from "@/lib/studioMcpContract";
import {
	clampFocusToDepth,
	DEFAULT_ZOOM_DEPTH,
	type ZoomArea,
	type ZoomDepth,
	type ZoomFocus,
	type ZoomRegion,
} from "./types";
import { clampZoomAreaFocus } from "./videoPlayback/zoomArea";

export function studioEdit(
	state: EditorState,
	name: string,
	args: StudioArguments,
	durationMs: number,
) {
	const startMs = args.startMs as number;
	const endMs = args.endMs as number;
	if (name === "studio_set_zoom" || name === "studio_add_trim" || name === "studio_add_speed") {
		if (!(startMs < endMs) || endMs > durationMs)
			throw new Error("Interval must fit inside the source duration and have positive length");
	}
	if (name === "studio_set_zoom") {
		const id = args.id as string | undefined;
		if (id && !state.zoomRegions.some((region) => region.id === id))
			throw new Error("Zoom id does not exist");
		if (
			state.zoomRegions.some(
				(region) => region.id !== id && region.startMs < endMs && startMs < region.endMs,
			)
		)
			throw new Error("Zoom overlaps another zoom");
		const depth = (args.depth ?? DEFAULT_ZOOM_DEPTH) as ZoomDepth;
		const area = args.area as ZoomArea | undefined;
		const focus = args.focus as ZoomFocus;
		const region: ZoomRegion = {
			id: id ?? `zoom-${crypto.randomUUID()}`,
			startMs,
			endMs,
			depth,
			focusMode: "manual",
			source: "manual",
			focus: clampFocusToDepth(focus, depth),
			...(args.scale !== undefined ? { customScale: args.scale as number } : {}),
			...(area ? { area } : {}),
		};
		if (area) region.focus = clampZoomAreaFocus(region);
		return {
			patch: {
				zoomRegions: [...state.zoomRegions.filter((item) => item.id !== id), region].sort(
					(a, b) => a.startMs - b.startMs,
				),
				autoZoomEnabled: false,
				autoFocusAll: false,
			},
			id: region.id,
		};
	}
	if (name === "studio_add_trim" || name === "studio_add_speed") {
		const speed = name === "studio_add_speed";
		const regions = speed ? state.speedRegions : state.trimRegions;
		if (regions.some((region) => region.startMs < endMs && startMs < region.endMs))
			throw new Error("Interval overlaps another region of this type");
		const id = `${speed ? "speed" : "trim"}-${crypto.randomUUID()}`;
		const patch: Partial<EditorState> = speed
			? {
					speedRegions: [
						...state.speedRegions,
						{ id, startMs, endMs, speed: args.speed as number },
					].sort((a, b) => a.startMs - b.startMs),
				}
			: {
					trimRegions: [...state.trimRegions, { id, startMs, endMs }].sort(
						(a, b) => a.startMs - b.startMs,
					),
				};
		return { patch, id };
	}
	if (name === "studio_remove_region") {
		const key = (
			{
				zoom: "zoomRegions",
				trim: "trimRegions",
				speed: "speedRegions",
				annotation: "annotationRegions",
			} as const
		)[args.kind as "zoom" | "trim" | "speed" | "annotation"];
		if (!key || !state[key].some((region) => region.id === args.id))
			throw new Error("Region id does not exist");
		return {
			patch: {
				[key]: state[key].filter((region) => region.id !== args.id),
			} as Partial<EditorState>,
		};
	}
	if (name === "studio_set_layout") {
		const { revision: _revision, ...patch } = args;
		return { patch: patch as Partial<EditorState> };
	}
	throw new Error("Unsupported Studio edit");
}
