import { Clapperboard, Copy, Download, FolderOpen } from "lucide-react";
import type {
	ExportFormat,
	ExportQuality,
	GifFrameRate,
	GifSizePreset,
} from "@/lib/exporter/types";

interface Props {
	format: ExportFormat;
	quality: ExportQuality;
	rate: GifFrameRate;
	size: GifSizePreset;
	loop: boolean;
	onFormat: (value: ExportFormat) => void;
	onQuality: (value: ExportQuality) => void;
	onRate: (value: GifFrameRate) => void;
	onSize: (value: GifSizePreset) => void;
	onLoop: (value: boolean) => void;
	onExport: () => void;
	busy: boolean;
	ready: boolean;
	exportedPath: string | null;
	onShowFile: () => void;
	onCopyPath: () => void;
}
export function DirectExportControls(props: Props) {
	const input = "h-9 rounded-md border border-white/15 bg-zinc-900 px-3 text-sm";
	return (
		<footer className="shrink-0 border-t border-white/10 px-6 py-4 space-y-4">
			<div className="flex flex-wrap items-end gap-3">
				<label className="grid gap-1 text-xs text-zinc-400">
					Format
					<select
						className={input}
						value={props.format}
						aria-label="Format"
						disabled={props.busy}
						onChange={(e) => props.onFormat(e.target.value as ExportFormat)}
					>
						<option value="mp4">MP4</option>
						<option value="gif">GIF</option>
					</select>
				</label>
				{props.format === "mp4" ? (
					<label className="grid gap-1 text-xs text-zinc-400">
						Quality
						<select
							className={input}
							value={props.quality}
							aria-label="Quality"
							disabled={props.busy}
							onChange={(e) => props.onQuality(e.target.value as ExportQuality)}
						>
							<option value="medium">Low</option>
							<option value="good">Balanced</option>
							<option value="source">Source</option>
						</select>
					</label>
				) : (
					<>
						<label className="grid gap-1 text-xs text-zinc-400">
							Frame rate
							<select
								className={input}
								value={props.rate}
								aria-label="Frame rate"
								disabled={props.busy}
								onChange={(e) => props.onRate(Number(e.target.value) as GifFrameRate)}
							>
								{[15, 20, 25, 30].map((rate) => (
									<option key={rate} value={rate}>
										{rate} fps
									</option>
								))}
							</select>
						</label>
						<label className="grid gap-1 text-xs text-zinc-400">
							Size
							<select
								className={input}
								value={props.size}
								aria-label="Size"
								disabled={props.busy}
								onChange={(e) => props.onSize(e.target.value as GifSizePreset)}
							>
								<option value="medium">Medium</option>
								<option value="large">Large</option>
								<option value="original">Original</option>
							</select>
						</label>
						<label className="flex items-center gap-2 h-9 text-sm">
							<input
								type="checkbox"
								checked={props.loop}
								disabled={props.busy}
								onChange={(e) => props.onLoop(e.target.checked)}
							/>
							Loop
						</label>
					</>
				)}
				<button
					type="button"
					className="ml-auto flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm text-white disabled:opacity-40"
					onClick={props.onExport}
					disabled={props.busy || !props.ready}
				>
					<Download size={16} />
					Export
				</button>
			</div>
			<div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
				<button
					type="button"
					className="flex items-center gap-2 hover:text-white disabled:opacity-40"
					disabled={props.busy}
					onClick={() => void window.electronAPI.openFullEditor()}
				>
					<Clapperboard size={16} />
					Open in editor
				</button>
				{props.exportedPath && (
					<>
						<button
							type="button"
							className="flex items-center gap-2 hover:text-white"
							onClick={props.onShowFile}
						>
							<FolderOpen size={16} />
							Show in folder
						</button>
						<button
							type="button"
							className="flex items-center gap-2 hover:text-white"
							onClick={props.onCopyPath}
						>
							<Copy size={16} />
							Copy file path
						</button>
					</>
				)}
			</div>
		</footer>
	);
}
