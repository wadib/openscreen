import { Crosshair, Trash2 } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getZoomScale, normalizeZoomArea, type ZoomRegion } from "./types";
import type { VideoLayoutGeometry } from "./VideoPlayback";

type Translate = (key: string, vars?: Record<string, string>) => string;

const THUMB_WIDTH = 192;
const THUMB_HEIGHT = 108;

function formatTime(ms: number): string {
	const total = Math.max(0, ms / 1000);
	const minutes = Math.floor(total / 60);
	const seconds = total - minutes * 60;
	return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

/** Zoomed view rectangle in recording coordinates (0..1), from stage-space focus/size. */
export function zoomViewInVideoSpace(
	region: ZoomRegion,
	geometry: VideoLayoutGeometry | null,
): { x: number; y: number; width: number; height: number } {
	const area = normalizeZoomArea(region.area);
	const scale = getZoomScale(region);
	const stageWidth = area ? area.width : 1 / scale;
	const stageHeight = area ? area.height : 1 / scale;
	const stageRect = {
		x: region.focus.cx - stageWidth / 2,
		y: region.focus.cy - stageHeight / 2,
		width: stageWidth,
		height: stageHeight,
	};
	if (!geometry || geometry.videoSize.width <= 0 || geometry.baseScale <= 0) return stageRect;
	const { stageSize, videoSize, baseScale, baseOffset } = geometry;
	const toVideoX = (x: number) =>
		(x * stageSize.width - baseOffset.x) / (videoSize.width * baseScale);
	const toVideoY = (y: number) =>
		(y * stageSize.height - baseOffset.y) / (videoSize.height * baseScale);
	const x = toVideoX(stageRect.x);
	const y = toVideoY(stageRect.y);
	return {
		x,
		y,
		width: toVideoX(stageRect.x + stageRect.width) - x,
		height: toVideoY(stageRect.y + stageRect.height) - y,
	};
}

function waitForSeek(video: HTMLVideoElement, timeSec: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			video.removeEventListener("seeked", onSeeked);
			video.removeEventListener("error", onError);
		};
		const onSeeked = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(new Error("Could not seek the recording"));
		};
		video.addEventListener("seeked", onSeeked);
		video.addEventListener("error", onError);
		video.currentTime = timeSec;
	});
}

function useZoomThumbnails(
	open: boolean,
	videoUrl: string | null,
	regions: ZoomRegion[],
	geometry: VideoLayoutGeometry | null,
): Record<string, string> {
	const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
	const key = regions
		.map(
			(region) =>
				`${region.id}:${region.startMs}:${region.endMs}:${region.focus.cx}:${region.focus.cy}:${region.depth}`,
		)
		.join("|");
	const geometryKey = geometry ? JSON.stringify(geometry) : "";

	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` and `geometryKey` stand in for the region and layout objects, which change identity on every render.
	useEffect(() => {
		if (!open || !videoUrl || regions.length === 0) return;
		let cancelled = false;
		const video = document.createElement("video");
		video.muted = true;
		video.preload = "auto";
		video.src = videoUrl;
		const canvas = document.createElement("canvas");
		canvas.width = THUMB_WIDTH;
		canvas.height = THUMB_HEIGHT;
		const ctx = canvas.getContext("2d");

		const run = async () => {
			if (!ctx) return;
			await new Promise<void>((resolve, reject) => {
				if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return resolve();
				video.addEventListener("loadedmetadata", () => resolve(), { once: true });
				video.addEventListener("error", () => reject(new Error("Could not load the recording")), {
					once: true,
				});
			});
			for (const region of regions) {
				if (cancelled) return;
				const middle = (region.startMs + region.endMs) / 2000;
				await waitForSeek(video, Math.min(middle, Math.max(0, video.duration - 0.05)));
				if (cancelled) return;
				ctx.fillStyle = "#000";
				ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
				const fit = Math.min(THUMB_WIDTH / video.videoWidth, THUMB_HEIGHT / video.videoHeight);
				const width = video.videoWidth * fit;
				const height = video.videoHeight * fit;
				const left = (THUMB_WIDTH - width) / 2;
				const top = (THUMB_HEIGHT - height) / 2;
				ctx.drawImage(video, left, top, width, height);
				const view = zoomViewInVideoSpace(region, geometry);
				ctx.strokeStyle = "#34B27B";
				ctx.lineWidth = 2;
				ctx.strokeRect(
					left + view.x * width,
					top + view.y * height,
					view.width * width,
					view.height * height,
				);
				const url = canvas.toDataURL("image/jpeg", 0.8);
				setThumbnails((previous) => ({ ...previous, [region.id]: url }));
			}
		};
		run().catch((error) => console.warn("[ZoomReview] Thumbnails unavailable:", error));
		return () => {
			cancelled = true;
			video.removeAttribute("src");
			video.load();
		};
	}, [open, videoUrl, key, geometryKey]);

	return thumbnails;
}

export function ZoomReviewDialog({
	open,
	onOpenChange,
	zoomRegions,
	videoUrl,
	selectedZoomId,
	geometry,
	onGoTo,
	onDelete,
	t,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	zoomRegions: ZoomRegion[];
	videoUrl: string | null;
	selectedZoomId: string | null;
	geometry: VideoLayoutGeometry | null;
	onGoTo: (region: ZoomRegion) => void;
	onDelete: (id: string) => void;
	t: Translate;
}) {
	const sorted = useMemo(
		() => [...zoomRegions].sort((a, b) => a.startMs - b.startMs),
		[zoomRegions],
	);
	const thumbnails = useZoomThumbnails(open, videoUrl, sorted, geometry);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-2xl max-h-[85vh] flex flex-col"
				style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
			>
				<DialogHeader>
					<DialogTitle>{t("zoomReview.title", { count: String(sorted.length) })}</DialogTitle>
					<DialogDescription>{t("zoomReview.description")}</DialogDescription>
				</DialogHeader>
				{sorted.length === 0 ? (
					<p className="py-6 text-center text-sm text-slate-400">{t("zoomReview.empty")}</p>
				) : (
					<div className="-mx-2 flex-1 overflow-y-auto px-2">
						<ul className="grid gap-2">
							{sorted.map((region, index) => (
								<li
									key={region.id}
									className={cn(
										"flex items-center gap-3 rounded-lg border p-2",
										region.id === selectedZoomId
											? "border-[#34B27B] bg-[#34B27B]/10"
											: "border-white/10 bg-white/[0.03]",
									)}
								>
									<button
										type="button"
										onClick={() => onGoTo(region)}
										className="shrink-0 overflow-hidden rounded-md bg-black"
										style={{ width: THUMB_WIDTH / 1.5, height: THUMB_HEIGHT / 1.5 }}
										title={t("zoomReview.goTo")}
									>
										{thumbnails[region.id] ? (
											<img
												src={thumbnails[region.id]}
												alt=""
												className="h-full w-full object-cover"
												draggable={false}
											/>
										) : (
											<div className="h-full w-full animate-pulse bg-white/5" />
										)}
									</button>
									<div className="min-w-0 flex-1 text-xs text-slate-300">
										<div className="flex items-center gap-2 text-sm font-medium text-white">
											<span>{t("zoomReview.item", { index: String(index + 1) })}</span>
											<span
												className={cn(
													"rounded px-1.5 py-0.5 text-[10px] font-medium",
													region.source === "auto"
														? "bg-sky-500/15 text-sky-300"
														: "bg-white/10 text-slate-300",
												)}
											>
												{region.source === "auto" ? t("zoomReview.auto") : t("zoomReview.manual")}
											</span>
										</div>
										<div className="mt-1 tabular-nums">
											{formatTime(region.startMs)} – {formatTime(region.endMs)} ·{" "}
											{((region.endMs - region.startMs) / 1000).toFixed(1)}s ·{" "}
											{getZoomScale(region).toFixed(1)}×
										</div>
									</div>
									<div className="flex shrink-0 items-center gap-1">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => onGoTo(region)}
											className="h-8 w-8 text-slate-300 hover:text-white"
											title={t("zoomReview.goTo")}
										>
											<Crosshair className="h-4 w-4" />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => onDelete(region.id)}
											className="h-8 w-8 text-slate-300 hover:text-red-400"
											title={t("zoomReview.delete")}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								</li>
							))}
						</ul>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
