/**
 * Window title for an agent-driven Studio instance, so several open instances can be told
 * apart and an export's progress is visible from the taskbar.
 */
export function studioWindowTitle(
	projectPath: string | null,
	isExporting: boolean,
	exportPercentage: number | null | undefined,
): string {
	const name = projectPath
		? (projectPath.split(/[\\/]/).pop() ?? projectPath).replace(/\.openscreen$/i, "")
		: "no project";
	const progress =
		isExporting && Number.isFinite(exportPercentage)
			? ` · exporting ${Math.min(100, Math.max(0, Math.floor(exportPercentage as number)))}%`
			: isExporting
				? " · exporting"
				: "";
	return `Openscreen Studio — ${name}${progress}`;
}
