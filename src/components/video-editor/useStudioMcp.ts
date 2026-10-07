import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { EditorState } from "@/hooks/useEditorHistory";
import type { ExportProgress, ExportQuality } from "@/lib/exporter";
import type { StudioCommand } from "@/lib/studioMcpContract";
import { studioEdit } from "./studioEdits";
import { studioWindowTitle } from "./studioTitle";

interface Options {
	snapshot: string | null;
	state: EditorState;
	loading: boolean;
	error: string | null;
	hasUnsavedChanges: boolean;
	projectPath: string | null;
	duration: number;
	currentTime: number;
	isPlaying: boolean;
	isExporting: boolean;
	exportProgress: ExportProgress | null;
	exportError: string | null;
	exportedFilePath: string | null;
	video: () => HTMLVideoElement | null | undefined;
	applyProject: (project: unknown, path?: string | null) => Promise<boolean>;
	copySaved: (path: string, snapshot: string) => void;
	pushState: (patch: Partial<EditorState>) => void;
	undo: () => void;
	redo: () => void;
	setMicrophone: (args: { offsetMs?: number; gain?: number; muted?: boolean }) => void;
	preview: (action: string, timeMs?: number) => Promise<void>;
	export: (path: string, quality: ExportQuality) => Promise<unknown>;
	cancelExport: () => void;
}

function showStudioTitle(current: Options) {
	document.title = studioWindowTitle(
		current.projectPath,
		current.isExporting,
		current.exportProgress?.percentage,
	);
}

export function useStudioMcp(options: Options) {
	const latest = useRef(options);
	latest.current = options;
	const revision = useRef(0);
	const previous = useRef<string | null>(null);
	// Only an agent-driven Studio receives commands; the normal editor keeps its own title.
	const studioMode = useRef(false);
	// Shown in the editor's top bar, since tiling compositors (Omarchy) have no title bar.
	const [isStudio, setIsStudio] = useState(false);
	if (previous.current !== options.snapshot) {
		revision.current++;
		previous.current = options.snapshot;
	}
	useEffect(
		() =>
			window.electronAPI.onStudioMcpCommand(async ({ name, args }: StudioCommand) => {
				if (!studioMode.current) setIsStudio(true);
				studioMode.current = true;
				showStudioTitle(latest.current);
				const current = latest.current;
				const video = current.video();
				const ready =
					!current.loading &&
					!current.error &&
					!!current.snapshot &&
					!!video &&
					video.readyState >= 2 &&
					Number.isFinite(video.duration) &&
					video.duration > 0;
				const project = current.snapshot ? { ...JSON.parse(current.snapshot), version: 2 } : null;
				if (name === "studio_status")
					return {
						ready,
						error: current.error,
						revision: revision.current,
						hasUnsavedChanges: current.hasUnsavedChanges,
						projectPath: current.projectPath,
						project,
						durationMs: (video?.duration || current.duration) * 1000,
						currentTimeMs: (video?.currentTime || 0) * 1000,
						isPlaying: current.isPlaying,
						isExporting: current.isExporting,
						exportProgress: current.exportProgress,
						exportError: current.exportError,
						exportedFilePath: current.exportedFilePath,
					};
				if (name === "studio_cancel_export") {
					current.cancelExport();
					return { cancellationRequested: true };
				}
				if (name === "studio_copy_saved") {
					flushSync(() => current.copySaved(args.path as string, args.snapshot as string));
					return { saved: true };
				}
				if (current.isExporting) throw new Error("Studio is exporting");
				if (name === "studio_open_project") {
					if (current.hasUnsavedChanges)
						throw new Error("Studio has unsaved edits; save a copy before opening another project");
					if (!(await current.applyProject(args.project, args.path as string)))
						throw new Error("Project could not be opened");
					return { opened: args.path, loading: true };
				}
				if (!ready) throw new Error("Studio media is not ready; poll studio_status");
				if (args.revision !== undefined && args.revision !== revision.current)
					throw new Error("Stale revision; inspect studio_status before editing");
				if (name === "studio_save_copy") return { project, snapshot: current.snapshot };
				if (name === "studio_check_export") return { ready: true };
				if (name === "studio_export")
					return current.export(args.path as string, (args.quality ?? "good") as ExportQuality);
				if (name === "studio_preview") {
					await current.preview(args.action as string, args.timeMs as number | undefined);
					return { currentTimeMs: current.video()!.currentTime * 1000 };
				}
				if (name === "studio_set_microphone") {
					if (!project.media.microphoneAudioPath)
						throw new Error("Project has no separate recorded microphone track");
					flushSync(() => current.setMicrophone(args));
					return { revision: revision.current };
				}
				if (name === "studio_history") {
					flushSync(() => (args.action === "undo" ? current.undo() : current.redo()));
					return { revision: revision.current };
				}
				const edit = studioEdit(current.state, name, args, video!.duration * 1000);
				flushSync(() => current.pushState(edit.patch));
				return { revision: revision.current, ...(edit.id ? { id: edit.id } : {}) };
			}),
		[],
	);
	const { projectPath, isExporting } = options;
	const exportPercentage = options.exportProgress?.percentage;
	useEffect(() => {
		if (studioMode.current)
			document.title = studioWindowTitle(projectPath, isExporting, exportPercentage);
	}, [projectPath, isExporting, exportPercentage]);
	return { isStudio };
}
