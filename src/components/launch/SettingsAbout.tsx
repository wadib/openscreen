import { ExternalLink, Github, LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { STUDIO_MCP_VERSION, STUDIO_TOOLS } from "@/lib/studioMcpContract";
import { isUpdateCheckEnabled, type UpdateCheckResult } from "../../../electron/update-checker";
import { Button } from "../ui/button";

export interface AppInfo {
	name: string;
	version: string;
	platform: NodeJS.Platform;
	arch: string;
}

export function SettingsAbout({ appInfo }: { appInfo: AppInfo | null }) {
	const t = useScopedT("launch");
	const [checking, setChecking] = useState(false);
	const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
	const [updateError, setUpdateError] = useState(false);
	const updatesEnabled = isUpdateCheckEnabled(appInfo?.version);
	const open = (url: string) => void window.electronAPI.openExternalUrl(url);
	const checkForUpdates = async () => {
		setChecking(true);
		setUpdateError(false);
		try {
			setUpdateResult(await window.electronAPI.checkForUpdates());
		} catch {
			setUpdateResult(null);
			setUpdateError(true);
		} finally {
			setChecking(false);
		}
	};
	const components = appInfo
		? [
				{ id: "studioMcp" as const, version: STUDIO_MCP_VERSION },
				{ id: "captureEngine" as const, version: appInfo.version },
				...(appInfo.platform === "win32"
					? [{ id: "blurry" as const, version: appInfo.version }]
					: []),
				{ id: "cameraControls" as const, version: appInfo.version },
			]
		: [];

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-h-0 flex-1 flex-col items-center overflow-auto px-6 py-7 text-center">
				<img src="./openscreen.png" alt="" className="h-16 w-16 rounded-xl object-cover" />
				<h1 className="mt-4 text-xl font-semibold text-zinc-100">Openscreen</h1>
				<p className="mt-1 max-w-xs text-sm leading-5 text-zinc-400">{t("about.description")}</p>
				<div className="mt-5 w-full border-y border-white/10 text-left">
					<div className="flex items-center justify-between gap-3 py-3 text-sm">
						<span className="text-zinc-400">{t("about.versionLabel")}</span>
						<strong data-testid="about-version" className="font-mono font-medium text-zinc-100">
							{appInfo?.version ?? t("about.loadingVersion")}
						</strong>
					</div>
					<div className="flex items-center justify-between gap-3 border-t border-white/10 py-3 text-sm">
						<span className="text-zinc-400">{t("about.mcpLabel")}</span>
						<span data-testid="about-mcp-version" className="font-mono text-zinc-200">
							{STUDIO_MCP_VERSION} · {t("about.mcpTools", { count: STUDIO_TOOLS.length })}
						</span>
					</div>
					{appInfo && (
						<div className="flex items-center justify-between gap-3 border-t border-white/10 py-3 text-sm">
							<span className="text-zinc-400">{t("about.systemLabel")}</span>
							<span className="text-zinc-200">
								{formatPlatform(appInfo.platform)} · {appInfo.arch}
							</span>
						</div>
					)}
				</div>
				<div className="mt-4 w-full text-left">
					<h2 className="text-xs font-medium uppercase text-zinc-500">
						{t("about.componentsTitle")}
					</h2>
					<div className="mt-1 divide-y divide-white/10 border-y border-white/10">
						{components.map((component) => {
							const remote = updateResult?.components.find(({ id }) => id === component.id);
							return (
								<div
									key={component.id}
									className="flex items-center justify-between gap-3 py-2 text-xs"
								>
									<span className="text-zinc-300">{t(`about.component.${component.id}`)}</span>
									<span className="text-right font-mono text-zinc-400">
										{component.version}
										{remote?.updateAvailable === true && remote.latestVersion
											? ` → ${remote.latestVersion}`
											: ""}
									</span>
								</div>
							);
						})}
					</div>
					<p className="mt-2 text-xs leading-5 text-zinc-500">{t("about.componentsBundled")}</p>
				</div>
				{updatesEnabled && (
					<div className="mt-4 flex w-full flex-col items-stretch gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={!appInfo || checking}
							onClick={() => void checkForUpdates()}
						>
							{checking ? (
								<LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
							) : (
								<RefreshCw size={14} aria-hidden="true" />
							)}
							{checking ? t("about.checkingUpdates") : t("about.checkUpdates")}
						</Button>
						{updateResult && (
							<div role="status" className="text-xs leading-5 text-zinc-300">
								<p>
									{updateResult.updateAvailable
										? t("about.updateAvailable", { version: updateResult.latestVersion })
										: t("about.upToDate")}
								</p>
								{!updateResult.manifestAvailable && (
									<p className="text-zinc-500">{t("about.manifestUnavailable")}</p>
								)}
								{updateResult.updateAvailable && (
									<button
										type="button"
										className="mt-1 inline-flex items-center gap-1 text-[#34B27B] hover:underline"
										onClick={() => open(updateResult.releaseUrl)}
									>
										{t("about.viewRelease")}
										<ExternalLink size={12} aria-hidden="true" />
									</button>
								)}
							</div>
						)}
						{updateError && (
							<p role="alert" className="text-xs leading-5 text-red-400">
								{t("about.updateCheckFailed")}
							</p>
						)}
					</div>
				)}
				<p className="mt-4 text-xs leading-5 text-zinc-500">{t("about.openSource")}</p>
			</div>
			<footer className="flex shrink-0 justify-center gap-2 border-t border-white/10 px-5 py-3">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => open("https://github.com/wadib/openscreen")}
				>
					<Github size={14} aria-hidden="true" />
					{t("about.repository")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => open("https://github.com/wadib/openscreen/blob/main/LICENSE")}
				>
					{t("about.license")}
					<ExternalLink size={14} aria-hidden="true" />
				</Button>
			</footer>
		</div>
	);
}

function formatPlatform(platform: NodeJS.Platform) {
	if (platform === "win32") return "Windows";
	if (platform === "darwin") return "macOS";
	if (platform === "linux") return "Linux";
	return platform;
}
