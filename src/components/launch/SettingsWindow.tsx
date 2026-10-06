import { FolderOpen, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n, useScopedT } from "@/contexts/I18nContext";
import type { Locale } from "@/i18n/config";
import { getAvailableLocales, getLocaleName } from "@/i18n/loader";
import type { AfterRecording } from "../../../electron/afterRecording";
import type { QuietSupport } from "../../../electron/recording/quiet-recording";
import { isUpdateCheckEnabled } from "../../../electron/update-checker";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip } from "../ui/tooltip";
import { ShortcutsConfigDialog } from "../video-editor/ShortcutsConfigDialog";
import { type AppInfo, SettingsAbout } from "./SettingsAbout";
import { SettingsHelp } from "./SettingsHelp";

const SETTINGS_SECTIONS = new Set(["general", "shortcuts", "help", "about"]);

function getInitialSection() {
	const requested = new URLSearchParams(window.location.search).get("section") ?? "general";
	return SETTINGS_SECTIONS.has(requested) ? requested : "general";
}

export function SettingsWindow() {
	const t = useScopedT("launch");
	const common = useScopedT("common");
	const { locale, setLocale, resolveSystemLocaleSuggestion } = useI18n();
	const [language, setLanguage] = useState(locale);
	const [tab, setTab] = useState(getInitialSection);
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
	const shortcutsT = useScopedT("shortcuts");
	const [mode, setMode] = useState<AfterRecording["mode"]>("editor");
	const [editorPath, setEditorPath] = useState("");
	const [quiet, setQuiet] = useState(false);
	const [hideAfterRecording, setHideAfterRecording] = useState(false);
	const [hideAfterVideo, setHideAfterVideo] = useState(false);
	const [quietSupport, setQuietSupport] = useState<QuietSupport>();
	const [ready, setReady] = useState(false);
	const [saving, setSaving] = useState(false);
	const [shortcutSaving, setShortcutSaving] = useState(false);
	const [choosing, setChoosing] = useState(false);
	const [error, setError] = useState("");
	const close = () => void window.electronAPI.closeSettings();
	useEffect(() => {
		document.title = t("settings.title");
	}, [t]);
	useEffect(() => {
		return window.electronAPI.onSettingsSectionChanged((section) => {
			if (SETTINGS_SECTIONS.has(section)) setTab(section);
		});
	}, []);
	useEffect(() => {
		let active = true;
		void window.electronAPI.getAppInfo().then(
			(info) => {
				if (active) setAppInfo(info);
			},
			() => undefined,
		);
		return () => {
			active = false;
		};
	}, []);
	useEffect(() => {
		let active = true;
		void window.electronAPI
			.readAfterRecordingSettings()
			.then((settings) => {
				if (!active) return;
				setMode(settings.mode);
				setEditorPath(settings.editorPath ?? "");
				setQuiet(settings.quietRecording === true);
				setHideAfterRecording(settings.hideAfterRecording === true);
				setHideAfterVideo(settings.hideAfterVideo === true);
				setReady(true);
			})
			.catch(() => {
				if (active) setError("settings.loadError");
			});
		return () => {
			active = false;
		};
	}, []);
	useEffect(() => {
		let active = true;
		void window.electronAPI.getQuietRecordingSupport().then(
			(value) => {
				if (active) setQuietSupport(value);
			},
			() => {
				if (active) setQuietSupport({ available: false, detail: "" });
			},
		);
		return () => {
			active = false;
		};
	}, []);
	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (
				event.key === "Escape" &&
				!event.defaultPrevented &&
				!saving &&
				!shortcutSaving &&
				!choosing
			)
				void window.electronAPI.closeSettings();
		};
		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [saving, shortcutSaving, choosing]);
	const chooseEditor = async () => {
		setChoosing(true);
		setError("");
		try {
			const selected = await window.electronAPI.chooseRecordingEditor();
			if (selected) setEditorPath(selected);
		} catch {
			setError("settings.chooseError");
		} finally {
			setChoosing(false);
		}
	};
	const save = async () => {
		if (!ready || saving || choosing || (mode === "external" && !editorPath)) return;
		if (quiet && !quietSupport?.available) {
			setError("settings.quietUnavailable");
			return;
		}
		setSaving(true);
		setError("");
		try {
			await window.electronAPI.saveAfterRecordingSettings({
				...(mode === "external" ? { mode, editorPath } : { mode }),
				...(quiet ? { quietRecording: true } : {}),
				...(hideAfterRecording ? { hideAfterRecording: true } : {}),
				...(hideAfterVideo ? { hideAfterVideo: true } : {}),
			});
			setLocale(language);
			resolveSystemLocaleSuggestion();
			await window.electronAPI.closeSettings();
		} catch {
			setError("settings.saveError");
			setSaving(false);
		}
	};
	const selectClass =
		"h-9 w-full rounded border border-white/15 bg-zinc-900 px-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50";
	return (
		<Tabs
			value={tab}
			onValueChange={setTab}
			className="flex h-screen flex-col bg-[#09090b] text-zinc-100"
		>
			<TabsList className="h-11 shrink-0 justify-start gap-1 rounded-none border-b border-white/10 bg-transparent px-5">
				<TabsTrigger value="general" disabled={saving || shortcutSaving || choosing}>
					{t("settings.general")}
				</TabsTrigger>
				<TabsTrigger value="shortcuts" disabled={saving || shortcutSaving || choosing}>
					{shortcutsT("title")}
				</TabsTrigger>
				<TabsTrigger value="help" disabled={saving || shortcutSaving || choosing}>
					{t("help.title")}
				</TabsTrigger>
				<TabsTrigger value="about" disabled={saving || shortcutSaving || choosing}>
					{t("about.title")}
				</TabsTrigger>
			</TabsList>
			<TabsContent
				forceMount
				value="general"
				className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
			>
				<form
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5">
						<label className="flex flex-col gap-1.5 text-xs text-zinc-400">
							{t("language")}
							<select
								data-testid="settings-language"
								className={selectClass}
								value={language}
								disabled={!ready || saving}
								onChange={(event) => setLanguage(event.target.value as Locale)}
							>
								{getAvailableLocales().map((value) => (
									<option key={value} value={value}>
										{getLocaleName(value)}
									</option>
								))}
							</select>
						</label>
						<label className="flex flex-col gap-1.5 text-xs text-zinc-400">
							{t("settings.afterRecording")}
							<select
								data-testid="settings-after-recording"
								className={selectClass}
								value={mode}
								disabled={!ready || saving}
								onChange={(event) => {
									setMode(event.target.value as AfterRecording["mode"]);
									setError("");
								}}
							>
								<option value="editor">{t("settings.openEditor")}</option>
								<option value="external">{t("settings.externalEditor")}</option>
								<option value="export">{t("settings.exportDirectly")}</option>
							</select>
						</label>
						{mode === "external" && (
							<div className="flex min-w-0 items-center gap-2">
								<input
									aria-label={t("settings.videoEditor")}
									className={`${selectClass} min-w-0 flex-1`}
									readOnly
									value={editorPath}
									placeholder={t("settings.chooseEditor")}
									title={editorPath}
								/>
								<Tooltip content={t("settings.chooseEditor")}>
									<button
										type="button"
										aria-label={t("settings.chooseEditor")}
										disabled={saving || choosing}
										onClick={() => void chooseEditor()}
										className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-white/15 hover:bg-white/10 disabled:opacity-50"
									>
										{choosing ? (
											<LoaderCircle size={16} className="animate-spin" />
										) : (
											<FolderOpen size={16} />
										)}
									</button>
								</Tooltip>
							</div>
						)}
						<Tooltip content={quietSupport?.detail || t("settings.quietUnavailable")}>
							<label className="flex items-center gap-2 text-sm text-zinc-100">
								<input
									type="checkbox"
									data-testid="settings-quiet-recording"
									className="h-4 w-4 shrink-0 accent-green-500"
									checked={quiet}
									disabled={!ready || saving || (!quiet && !quietSupport?.available)}
									onChange={(event) => {
										setQuiet(event.target.checked);
										setError("");
									}}
								/>
								{t("settings.quietRecording")}
							</label>
						</Tooltip>
						{quietSupport && !quietSupport.available && (
							<p role="status" className="text-xs text-zinc-400">
								{t("settings.quietUnavailable")}
							</p>
						)}
						<label className="flex items-center gap-2 text-sm text-zinc-100">
							<input
								type="checkbox"
								data-testid="settings-hide-after-recording"
								className="h-4 w-4 shrink-0 accent-green-500"
								checked={hideAfterRecording}
								disabled={!ready || saving}
								onChange={(event) => setHideAfterRecording(event.target.checked)}
							/>
							{t("settings.hideAfterRecording")}
						</label>
						<label className="flex items-center gap-2 text-sm text-zinc-100">
							<input
								type="checkbox"
								data-testid="settings-hide-after-video"
								className="h-4 w-4 shrink-0 accent-green-500"
								checked={hideAfterVideo}
								disabled={!ready || saving}
								onChange={(event) => setHideAfterVideo(event.target.checked)}
							/>
							{t("settings.hideAfterVideo")}
						</label>
						{error && (
							<p role="alert" className="text-xs text-red-400">
								{t(error)}
							</p>
						)}
					</div>
					<footer className="flex shrink-0 justify-end gap-2 border-t border-white/10 px-5 py-3">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={saving || choosing}
							onClick={close}
						>
							{common("actions.cancel")}
						</Button>
						<Button
							type="submit"
							size="sm"
							disabled={!ready || saving || choosing || (mode === "external" && !editorPath)}
						>
							{saving && <LoaderCircle size={14} className="animate-spin" />}
							{common("actions.save")}
						</Button>
					</footer>
				</form>
			</TabsContent>
			<TabsContent
				forceMount
				value="shortcuts"
				className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
			>
				<ShortcutsConfigDialog
					embedded
					active={tab === "shortcuts"}
					onClose={close}
					onSavingChange={setShortcutSaving}
				/>
			</TabsContent>
			<TabsContent
				forceMount
				value="help"
				className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
			>
				<SettingsHelp
					onOpenShortcuts={() => setTab("shortcuts")}
					updatesEnabled={isUpdateCheckEnabled(appInfo?.version)}
				/>
			</TabsContent>
			<TabsContent
				forceMount
				value="about"
				className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
			>
				<SettingsAbout appInfo={appInfo} />
			</TabsContent>
		</Tabs>
	);
}
