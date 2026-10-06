import { getZoomScale, normalizeZoomArea, type ZoomFocus, type ZoomRegion } from "../types";
import { clampFocusToScale } from "./focusUtils";

export function getZoomAreaSize(region: ZoomRegion) {
	return (
		normalizeZoomArea(region.area) ?? {
			width: 1 / getZoomScale(region),
			height: 1 / getZoomScale(region),
			fit: "fit" as const,
		}
	);
}

export function clampZoomAreaFocus(region: ZoomRegion, focus = region.focus): ZoomFocus {
	const area = normalizeZoomArea(region.area);
	if (!area) return clampFocusToScale(focus, getZoomScale(region));
	return {
		cx: Math.max(
			area.width / 2,
			Math.min(1 - area.width / 2, Number.isFinite(focus.cx) ? focus.cx : 0.5),
		),
		cy: Math.max(
			area.height / 2,
			Math.min(1 - area.height / 2, Number.isFinite(focus.cy) ? focus.cy : 0.5),
		),
	};
}

type Rect = { x: number; y: number; width: number; height: number };

export function getZoomAreaMask(
	region: ZoomRegion | null,
	stage: { width: number; height: number },
	baseMask: Rect,
	progress: number,
): Rect {
	const area = normalizeZoomArea(region?.area);
	if (!region || !area || progress <= 0) return baseMask;
	const amount = Math.max(0, Math.min(1, progress));
	const left = Math.max(baseMask.x, (region.focus.cx - area.width / 2) * stage.width);
	const top = Math.max(baseMask.y, (region.focus.cy - area.height / 2) * stage.height);
	const right = Math.max(
		left,
		Math.min(baseMask.x + baseMask.width, (region.focus.cx + area.width / 2) * stage.width),
	);
	const bottom = Math.max(
		top,
		Math.min(baseMask.y + baseMask.height, (region.focus.cy + area.height / 2) * stage.height),
	);
	return {
		x: baseMask.x + (left - baseMask.x) * amount,
		y: baseMask.y + (top - baseMask.y) * amount,
		width: baseMask.width + (right - left - baseMask.width) * amount,
		height: baseMask.height + (bottom - top - baseMask.height) * amount,
	};
}
