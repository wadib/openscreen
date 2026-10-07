import { CheckCircle2, CircleSlash, FolderOpen, Loader2, XCircle } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { BatchExportOptions, BatchExportUiEvent } from "../../../electron/batchExport";
import {
	type BatchState,
	fileName,
	INITIAL_BATCH_STATE,
	previewJobs,
	reduceBatchEvent,
} from "./batchExportState";

type Translate = (key: string, vars?: Record<string, string>) => string;

const SETTINGS_KEY = "openscreen_batch_export";

type Action =
	| { type: "event"; event: BatchExportUiEvent }
	| { type: "preview"; jobs: BatchState["jobs"]; error?: string }
	| { type: "starting" }
	| { type: "cancelling" };

function reducer(state: BatchState, action: Action): BatchState {
	switch (action.type) {
		case "event":
			return reduceBatchEvent(state, action.event);
		case "preview":
			return { phase: "idle", jobs: action.jobs, error: action.error };
		case "starting":
			return { ...state, phase: "running", summary: undefined, error: undefined };
		case "cancelling":
			return { ...state, phase: "cancelled" };
	}
}

function loadSettings(defaultFolder: string): BatchExportOptions {
	const fallback: BatchExportOptions = {
		folder: defaultFolder,
		outputDir: defaultFolder
			? `${defaultFolder}${defaultFolder.includes("\\") ? "\\" : "/"}exports`
			: "",
		only: "*_done",
		exclude: "",
		quality: "good",
		overwrite: false,
	};
	try {
		const saved = JSON.parse(
			localStorage.getItem(SETTINGS_KEY) ?? "null",
		) as Partial<BatchExportOptions> | null;
		return saved && typeof saved === "object" ? { ...fallback, ...saved } : fallback;
	} catch {
		return fallback;
	}
}

/**
 * Export many projects at once (the command-line `--export-dir` exporter, run in the
 * background). The editor stays usable; closing the dialog does not stop the batch.
 */
export function BatchExportDialog({
	open,
	onOpenChange,
	defaultFolder,
	t,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	defaultFolder: string;
	t: Translate;
}) {
	const [settings, setSettings] = useState<BatchExportOptions>(() => loadSettings(defaultFolder));
	const [state, dispatch] = useReducer(reducer, INITIAL_BATCH_STATE);
	const running = state.phase === "running";
	const api = window.electronAPI;
	const previewSeq = useRef(0);

	useEffect(
		() => window.electronAPI?.onBatchExportEvent?.((event) => dispatch({ type: "event", event })),
		[],
	);

	const update = (patch: Partial<BatchExportOptions>) =>
		setSettings((previous) => {
			const next = { ...previous, ...patch };
			try {
				localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
			} catch {
				/* settings last for this session only */
			}
			return next;
		});

	const refreshPreview = useCallback(async () => {
		if (!window.electronAPI?.batchExportPreview || !settings.folder || !settings.outputDir) {
			dispatch({ type: "preview", jobs: [] });
			return;
		}
		const seq = ++previewSeq.current;
		const result = await window.electronAPI.batchExportPreview(settings);
		if (seq !== previewSeq.current) return;
		dispatch({
			type: "preview",
			jobs: previewJobs(result.jobs, result.skipped),
			error: result.error,
		});
	}, [settings]);

	// Refresh the list while the dialog is open and nothing is running.
	useEffect(() => {
		if (!open || running) return;
		const timer = setTimeout(() => void refreshPreview(), 250);
		return () => clearTimeout(timer);
	}, [open, running, refreshPreview]);

	const pick = async (key: "folder" | "outputDir") => {
		const chosen = await api?.batchExportPickFolder?.(
			key === "folder" ? t("batchExport.chooseProjects") : t("batchExport.chooseOutput"),
			settings[key] || undefined,
		);
		if (chosen) update({ [key]: chosen });
	};

	const toExport = state.jobs.filter((job) => job.status !== "skipped").length;
	const start = async () => {
		dispatch({ type: "starting" });
		const result = await api?.batchExportStart?.(settings);
		if (!result?.started) {
			dispatch({
				type: "event",
				event: { type: "error", message: result?.error ?? "Could not start" },
			});
			dispatch({ type: "event", event: { type: "exit", code: null } });
		}
	};
	const cancel = async () => {
		dispatch({ type: "cancelling" });
		await api?.batchExportCancel?.();
	};

	const field =
		"h-9 min-w-0 flex-1 rounded-md border border-white/15 bg-black/40 px-3 text-sm text-white outline-none focus:border-[#34B27B] disabled:opacity-60";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-2xl max-h-[88vh] flex flex-col"
				style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
			>
				<DialogHeader>
					<DialogTitle>{t("batchExport.title")}</DialogTitle>
					<DialogDescription>{t("batchExport.description")}</DialogDescription>
				</DialogHeader>

				<div className="grid gap-3 py-1">
					{(["folder", "outputDir"] as const).map((key) => (
						<div key={key} className="grid gap-1.5">
							<Label>
								{key === "folder" ? t("batchExport.projects") : t("batchExport.output")}
							</Label>
							<div className="flex gap-2">
								<input
									className={field}
									value={settings[key]}
									disabled={running}
									spellCheck={false}
									onChange={(event) => update({ [key]: event.target.value })}
								/>
								<Button
									type="button"
									variant="outline"
									disabled={running}
									onClick={() => void pick(key)}
									className="border-white/20 bg-transparent text-white hover:bg-white/10"
								>
									<FolderOpen className="h-4 w-4" />
								</Button>
							</div>
						</div>
					))}
					<div className="grid grid-cols-2 gap-3">
						<div className="grid gap-1.5">
							<Label>{t("batchExport.only")}</Label>
							<input
								className={field}
								value={settings.only}
								disabled={running}
								placeholder="*_done"
								onChange={(event) => update({ only: event.target.value })}
							/>
						</div>
						<div className="grid gap-1.5">
							<Label>{t("batchExport.exclude")}</Label>
							<input
								className={field}
								value={settings.exclude}
								disabled={running}
								placeholder="*p2_done"
								onChange={(event) => update({ exclude: event.target.value })}
							/>
						</div>
					</div>
					<div className="flex items-center gap-6">
						<div className="flex items-center gap-2">
							<Label>{t("batchExport.quality")}</Label>
							<Select
								value={settings.quality}
								disabled={running}
								onValueChange={(value) =>
									update({ quality: value as BatchExportOptions["quality"] })
								}
							>
								<SelectTrigger className="h-8 w-28">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="medium">720p</SelectItem>
									<SelectItem value="good">1080p</SelectItem>
									<SelectItem value="source">{t("batchExport.source")}</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-center gap-2">
							<Switch
								checked={settings.overwrite}
								disabled={running}
								onCheckedChange={(overwrite) => update({ overwrite })}
								className="data-[state=checked]:bg-[#34B27B]"
							/>
							<Label>{t("batchExport.overwrite")}</Label>
						</div>
					</div>
				</div>

				<div className="min-h-[120px] flex-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20">
					{state.jobs.length === 0 ? (
						<p className="p-4 text-center text-xs text-slate-500">
							{state.error ?? t("batchExport.nothing")}
						</p>
					) : (
						<ul className="divide-y divide-white/5">
							{state.jobs.map((job) => (
								<li key={job.output} className="flex items-center gap-3 px-3 py-2 text-xs">
									<span className="w-4 shrink-0">
										{job.status === "running" ? (
											<Loader2 className="h-4 w-4 animate-spin text-[#34B27B]" />
										) : job.status === "done" ? (
											<CheckCircle2 className="h-4 w-4 text-[#34B27B]" />
										) : job.status === "failed" ? (
											<XCircle className="h-4 w-4 text-red-400" />
										) : job.status === "skipped" ? (
											<CircleSlash className="h-4 w-4 text-slate-500" />
										) : null}
									</span>
									<span
										className={cn(
											"min-w-0 flex-1 truncate",
											job.status === "skipped" ? "text-slate-500" : "text-slate-200",
										)}
										title={job.error ? `${job.project}\n${job.error}` : job.project}
									>
										{fileName(job.project).replace(/\.openscreen$/i, "")}
										{job.error && <span className="ml-2 text-red-400">{job.error}</span>}
									</span>
									<span className="w-28 shrink-0">
										{job.status === "running" ? (
											<span className="block h-1.5 overflow-hidden rounded bg-white/10">
												<span
													className="block h-full bg-[#34B27B]"
													style={{ width: `${Math.round(job.percentage)}%` }}
												/>
											</span>
										) : (
											<span className="block text-right tabular-nums text-slate-500">
												{job.status === "skipped"
													? t("batchExport.exists")
													: job.status === "done"
														? `${job.seconds ?? 0}s`
														: ""}
											</span>
										)}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
				{state.summary && (
					<p className="text-xs text-slate-300">
						{t("batchExport.summary", {
							exported: String(state.summary.exported),
							total: String(state.summary.total),
							seconds: String(state.summary.seconds),
						})}
					</p>
				)}
				{state.error && state.jobs.length > 0 && (
					<p className="text-xs text-red-400">{state.error}</p>
				)}

				<DialogFooter className="gap-2 sm:gap-0">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						className="border-white/20 bg-transparent text-white hover:bg-white/10"
					>
						{running ? t("batchExport.hide") : t("batchExport.close")}
					</Button>
					{running ? (
						<Button
							type="button"
							onClick={() => void cancel()}
							className="bg-red-500/80 text-white hover:bg-red-500"
						>
							{t("batchExport.cancel")}
						</Button>
					) : (
						<Button
							type="button"
							disabled={toExport === 0}
							onClick={() => void start()}
							className="bg-[#34B27B] text-white hover:bg-[#34B27B]/90"
						>
							{t("batchExport.start", { count: String(toExport) })}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
