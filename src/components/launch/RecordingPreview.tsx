import { LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { useRecordingPreview } from "@/hooks/useRecordingPreview";
import { computeRecordingPreviewLayout } from "@/lib/recordingPreview";
import { Tooltip } from "../ui/tooltip";

export function RecordingPreview() {
	const t = useScopedT("launch");
	const { source, stream, unavailable, retry, webcam, webcamEnabled } = useRecordingPreview();
	const videoRef = useRef<HTMLVideoElement>(null);
	const webcamRef = useRef<HTMLVideoElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
	const [screenSize, setScreenSize] = useState({ width: 0, height: 0 });
	const [webcamSize, setWebcamSize] = useState({ width: 0, height: 0 });
	const layout = computeRecordingPreviewLayout(stageSize, screenSize, webcamSize);
	const webcamRect = layout?.webcamRect;
	useEffect(() => {
		const stage = stageRef.current;
		if (!stage) return;
		const observer = new ResizeObserver(([entry]) =>
			setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
		);
		observer.observe(stage);
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		document.title = t("preview.title");
	}, [t]);
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		video.srcObject = stream;
		return () => {
			video.srcObject = null;
		};
	}, [stream]);
	useEffect(() => {
		const video = webcamRef.current;
		if (!video) return;
		video.srcObject = webcam.stream;
		return () => {
			video.srcObject = null;
		};
	}, [webcam.stream]);

	return (
		<main className="h-screen min-h-0 flex flex-col overflow-hidden bg-[#09090b] text-zinc-100">
			<header className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-3 text-xs">
				<span
					className={`h-1.5 w-1.5 shrink-0 rounded-full ${stream ? "bg-green-400" : "bg-zinc-500"}`}
				/>
				<span className="min-w-0 flex-1 truncate" title={source?.name}>
					{source?.name || t("preview.title")}
				</span>
			</header>
			<div ref={stageRef} className="relative min-h-0 flex-1 bg-black">
				<video
					ref={videoRef}
					data-testid="recording-preview-screen"
					aria-label={t("preview.title")}
					autoPlay
					playsInline
					muted
					onLoadedMetadata={(event) =>
						setScreenSize({
							width: event.currentTarget.videoWidth,
							height: event.currentTarget.videoHeight,
						})
					}
					className={`absolute object-contain ${stream ? "" : "invisible"}`}
					style={{
						left: layout?.screenRect.x ?? 0,
						top: layout?.screenRect.y ?? 0,
						width: layout?.screenRect.width ?? 0,
						height: layout?.screenRect.height ?? 0,
					}}
				/>
				<video
					ref={webcamRef}
					data-testid="recording-preview-webcam"
					aria-label={t("webcam.enableWebcam")}
					autoPlay
					playsInline
					muted
					onLoadedMetadata={(event) =>
						setWebcamSize({
							width: event.currentTarget.videoWidth,
							height: event.currentTarget.videoHeight,
						})
					}
					className="absolute object-cover"
					style={{
						left: webcamRect?.x ?? 0,
						top: webcamRect?.y ?? 0,
						width: webcamRect?.width ?? 0,
						height: webcamRect?.height ?? 0,
						borderRadius: webcamRect?.borderRadius ?? 0,
						visibility: stream && webcam.stream && webcamRect ? "visible" : "hidden",
					}}
				/>
				{stream && webcamEnabled && !webcam.stream && (
					<div
						role={webcam.unavailable ? "alert" : "status"}
						className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/80 p-2 text-xs text-zinc-300"
					>
						{!webcam.unavailable && <LoaderCircle size={14} className="animate-spin" />}
						<span>{t(webcam.unavailable ? "webcam.unavailable" : "preview.connecting")}</span>
						{webcam.unavailable && (
							<button
								type="button"
								aria-label={t("preview.retry")}
								onClick={retry}
								className="flex h-6 w-6 items-center justify-center rounded-sm hover:bg-white/10"
							>
								<RefreshCw size={14} />
							</button>
						)}
					</div>
				)}
				{!stream && (
					<div
						className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center text-xs text-zinc-400"
						role={unavailable ? "alert" : "status"}
					>
						{!unavailable && source && <LoaderCircle size={18} className="animate-spin" />}
						<span>
							{t(
								unavailable
									? "preview.unavailable"
									: source
										? "preview.connecting"
										: "preview.selectSource",
							)}
						</span>
						{unavailable && source && (
							<Tooltip content={t("preview.retry")}>
								<button
									type="button"
									aria-label={t("preview.retry")}
									onClick={retry}
									className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-100 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-400"
								>
									<RefreshCw size={16} />
								</button>
							</Tooltip>
						)}
					</div>
				)}
			</div>
		</main>
	);
}
