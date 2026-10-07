/** Project file name without folders or the .openscreen extension. */
export function projectDisplayName(projectPath: string | null): string | null {
	if (!projectPath) return null;
	return (projectPath.split(/[\\/]/).pop() ?? projectPath).replace(/\.openscreen$/i, "");
}

/**
 * Window title for an agent-driven Studio instance, so several open instances can be told
 * apart and an export's progress is visible from the taskbar.
 */
export function studioWindowTitle(
	projectPath: string | null,
	isExporting: boolean,
	exportPercentage: number | null | undefined,
): string {
	const name = projectDisplayName(projectPath) ?? "no project";
	const progress =
		isExporting && Number.isFinite(exportPercentage)
			? ` · exporting ${Math.min(100, Math.max(0, Math.floor(exportPercentage as number)))}%`
			: isExporting
				? " · exporting"
				: "";
	return `Openscreen Studio — ${name}${progress}`;
}
