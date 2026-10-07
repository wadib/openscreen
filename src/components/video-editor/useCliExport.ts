import { useEffect, useRef } from "react";
import type { ExportProgress, ExportQuality } from "@/lib/exporter";
import { onExportDiagnostic } from "@/lib/exporter/exportDiagnostics";

const READY_TIMEOUT_MS = 120_000;

interface Options {
	applyProject: (project: unknown, path?: string | null) => Promise<boolean>;
	video: () => HTMLVideoElement | null | undefined;
	exportTo: (path: string, quality: ExportQuality) => Promise<unknown>;
	exportProgress: ExportProgress | null;
}

async function waitForVideo(video: Options["video"]): Promise<void> {
	const started = Date.now();
	for (;;) {
		const element = video();
		if (
			element &&
			element.readyState >= 2 &&
			Number.isFinite(element.duration) &&
			element.duration > 0
		) {
			return;
		}
		if (Date.now() - started > READY_TIMEOUT_MS) throw new Error("The recording did not load");
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

/** Renderer side of command-line export: load each project and export it. */
export function useCliExport(options: Options) {
	const latest = useRef(options);
	latest.current = options;
	const activeJob = useRef<string | null>(null);

	useEffect(() => {
		const api = window.electronAPI;
		if (!api?.onCliExportJob) return;
		return api.onCliExportJob(async (job) => {
			activeJob.current = job.id;
			const stopDiagnostics = onExportDiagnostic((message) =>
				api.reportCliExportLog?.(job.id, message),
			);
			try {
				const loaded = await api.loadProjectFileFromPath(job.project);
				if (!loaded.success || !loaded.project) {
					throw new Error(loaded.message || loaded.error || "Could not open the project");
				}
				const restored = await latest.current.applyProject(
					loaded.project,
					loaded.path ?? job.project,
				);
				if (!restored) throw new Error("Could not apply the project (missing media?)");
				await waitForVideo(latest.current.video);
				await latest.current.exportTo(job.output, job.quality);
				api.reportCliExportResult?.({ id: job.id, success: true });
			} catch (error) {
				api.reportCliExportResult?.({
					id: job.id,
					success: false,
					error: error instanceof Error ? error.message : String(error),
				});
			} finally {
				stopDiagnostics();
				activeJob.current = null;
			}
		});
	}, []);

	const percentage = options.exportProgress?.percentage;
	useEffect(() => {
		if (activeJob.current && typeof percentage === "number") {
			window.electronAPI?.reportCliExportProgress?.(activeJob.current, percentage);
		}
	}, [percentage]);
}
