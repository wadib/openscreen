import { type CSSProperties, useEffect, useState } from "react";
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
import {
	type CleanupSettings,
	type FillerEngine,
	loadCleanupSettings,
	MIN_PAUSE_CHOICES,
} from "./useSpeechTools";

type Translate = (key: string, vars?: Record<string, string>) => string;

export function CleanupDialog({
	open,
	onOpenChange,
	onRun,
	busy,
	usesMicrophone,
	t,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onRun: (settings: CleanupSettings) => void;
	busy: boolean;
	usesMicrophone: boolean;
	t: Translate;
}) {
	const [settings, setSettings] = useState<CleanupSettings>(loadCleanupSettings);
	useEffect(() => {
		if (open) setSettings(loadCleanupSettings());
	}, [open]);
	const update = (patch: Partial<CleanupSettings>) =>
		setSettings((prev) => ({ ...prev, ...patch }));
	const nothingSelected = !settings.pauses && settings.fillers === "off";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md"
				style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
			>
				<DialogHeader>
					<DialogTitle>{t("cleanup.dialogTitle")}</DialogTitle>
					<DialogDescription>
						{t("cleanup.dialogDescription")}{" "}
						{usesMicrophone ? t("cleanup.sourceMicrophone") : t("cleanup.sourceScreen")}
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-2">
					<div className="flex items-center justify-between gap-3">
						<Label htmlFor="cleanup-pauses">{t("cleanup.pauses")}</Label>
						<Switch
							id="cleanup-pauses"
							checked={settings.pauses}
							onCheckedChange={(pauses) => update({ pauses })}
							className="data-[state=checked]:bg-[#34B27B]"
						/>
					</div>
					{settings.pauses && (
						<div className="grid gap-2">
							<Label htmlFor="cleanup-min-pause">{t("cleanup.minPause")}</Label>
							<Select
								value={String(settings.minPauseMs)}
								onValueChange={(value) => update({ minPauseMs: Number.parseInt(value, 10) })}
							>
								<SelectTrigger id="cleanup-min-pause" className="h-9">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{MIN_PAUSE_CHOICES.map((ms) => (
										<SelectItem key={ms} value={String(ms)}>
											{t("cleanup.seconds", { count: String(ms / 1000) })}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					<div className="grid gap-2">
						<Label htmlFor="cleanup-fillers">{t("cleanup.fillers")}</Label>
						<Select
							value={settings.fillers}
							onValueChange={(value) => update({ fillers: value as FillerEngine })}
						>
							<SelectTrigger id="cleanup-fillers" className="h-9">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="off">{t("cleanup.fillersOff")}</SelectItem>
								<SelectItem value="local">{t("cleanup.fillersLocal")}</SelectItem>
								<SelectItem value="crisperwhisper">{t("cleanup.fillersServer")}</SelectItem>
							</SelectContent>
						</Select>
						{settings.fillers === "local" && (
							<p className="text-xs text-slate-400">{t("cleanup.fillersLocalHint")}</p>
						)}
					</div>
					{settings.fillers === "crisperwhisper" && (
						<div className="grid gap-2">
							<Label htmlFor="cleanup-server">{t("cleanup.serverUrl")}</Label>
							<input
								id="cleanup-server"
								value={settings.serverUrl}
								onChange={(event) => update({ serverUrl: event.target.value.trim() })}
								className="h-9 rounded-md border border-white/15 bg-black/40 px-3 text-sm text-white outline-none focus:border-[#34B27B]"
								spellCheck={false}
							/>
						</div>
					)}
					<p className="text-xs text-slate-400">{t("cleanup.undoHint")}</p>
				</div>
				<DialogFooter className="gap-2 sm:gap-0">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						className="border-white/20 bg-transparent text-white hover:bg-white/10"
					>
						{t("autoCaptions.dialogCancel")}
					</Button>
					<Button
						type="button"
						disabled={
							busy ||
							nothingSelected ||
							(settings.fillers === "crisperwhisper" && !/^https?:\/\//i.test(settings.serverUrl))
						}
						onClick={() => {
							onOpenChange(false);
							onRun(settings);
						}}
						className="bg-[#34B27B] text-white hover:bg-[#34B27B]/90"
					>
						{t("cleanup.run")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
