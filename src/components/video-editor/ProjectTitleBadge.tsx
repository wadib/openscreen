import { projectDisplayName } from "./studioTitle";

type Translate = (key: string, vars?: Record<string, string>) => string;

/**
 * Which project this window is working on, in the editor's top bar. Window titles are
 * invisible on tiling compositors without title bars (Omarchy), and several Studio instances
 * can be open at once, so the name, unsaved state and export progress are shown inside the
 * window. It fills the space between the buttons and the window controls and truncates
 * instead of overlapping them.
 */
export function ProjectTitleBadge({
	projectPath,
	hasUnsavedChanges,
	isExporting,
	exportPercentage,
	isStudio,
	t,
}: {
	projectPath: string | null;
	hasUnsavedChanges: boolean;
	isExporting: boolean;
	exportPercentage?: number | null;
	isStudio: boolean;
	t: Translate;
}) {
	const name = projectDisplayName(projectPath);
	if (!name && !isStudio) return null;
	const percent =
		isExporting && typeof exportPercentage === "number" && Number.isFinite(exportPercentage)
			? Math.min(100, Math.max(0, Math.floor(exportPercentage)))
			: null;

	return (
		<div
			className="pointer-events-none flex min-w-0 flex-1 items-center justify-center gap-2 px-3 text-[11px]"
			data-testid="project-title"
			title={projectPath ?? undefined}
		>
			{isStudio && (
				<span className="shrink-0 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-amber-300">
					{t("projectTitle.studio")}
				</span>
			)}
			<span className="truncate font-medium text-white/75">
				{name ?? t("projectTitle.untitled")}
			</span>
			{hasUnsavedChanges && (
				<span
					className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300"
					role="img"
					aria-label={t("projectTitle.unsaved")}
				/>
			)}
			{isExporting && (
				<span className="shrink-0 tabular-nums text-[#34B27B]">
					{percent === null
						? t("projectTitle.exporting")
						: t("projectTitle.exportingPercent", { percent: String(percent) })}
				</span>
			)}
		</div>
	);
}
