import { Keyboard, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { useScopedT } from "@/contexts/I18nContext";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import {
	DEFAULT_SHORTCUTS,
	FIXED_SHORTCUTS,
	findConflict,
	formatBinding,
	SHORTCUT_ACTIONS,
	type ShortcutAction,
	type ShortcutBinding,
	type ShortcutConflict,
	type ShortcutsConfig,
} from "@/lib/shortcuts";
import { BLUR_REGIONS_ENABLED } from "./featureFlags";

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

export function ShortcutsConfigDialog({
	embedded = false,
	active = true,
	onClose,
	onSavingChange,
}: {
	embedded?: boolean;
	active?: boolean;
	onClose?: () => void;
	onSavingChange?: (saving: boolean) => void;
} = {}) {
	const { shortcuts, ready, isMac, isConfigOpen, closeConfig, setShortcuts, persistShortcuts } =
		useShortcuts();
	const t = useScopedT("shortcuts");
	const tc = useScopedT("common");
	const isOpen = embedded ? active : isConfigOpen;
	const close = onClose ?? closeConfig;
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState("");
	useEffect(() => {
		onSavingChange?.(saving);
	}, [onSavingChange, saving]);

	const [draft, setDraft] = useState<ShortcutsConfig>(shortcuts);
	const [captureFor, setCaptureFor] = useState<ShortcutAction | null>(null);
	const [conflict, setConflict] = useState<{
		forAction: ShortcutAction;
		pending: ShortcutBinding;
		conflictWith: ShortcutConflict;
	} | null>(null);

	useEffect(() => {
		if (embedded || isConfigOpen) {
			setDraft(shortcuts);
			setCaptureFor(null);
			setConflict(null);
		}
	}, [embedded, isConfigOpen, shortcuts]);

	useEffect(() => {
		if (!isOpen) {
			setCaptureFor(null);
			setConflict(null);
		}
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen || !captureFor || saving) return;

		const handleCapture = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();

			if (e.key === "Escape") {
				setCaptureFor(null);
				return;
			}

			if (MODIFIER_KEYS.has(e.key)) return;

			const binding: ShortcutBinding = {
				key: e.key.toLowerCase(),
				...(e.ctrlKey || e.metaKey ? { ctrl: true } : {}),
				...(e.shiftKey ? { shift: true } : {}),
				...(e.altKey ? { alt: true } : {}),
			};

			const found = findConflict(binding, captureFor, draft);
			setCaptureFor(null);

			if (found?.type === "fixed") {
				toast.error(t("reservedShortcut", { label: found.label }));
				return;
			}

			if (found?.type === "configurable") {
				setConflict({ forAction: captureFor, pending: binding, conflictWith: found });
				return;
			}

			setDraft((prev: ShortcutsConfig) => ({ ...prev, [captureFor]: binding }));
		};

		window.addEventListener("keydown", handleCapture, { capture: true });
		return () => window.removeEventListener("keydown", handleCapture, { capture: true });
	}, [captureFor, draft, t, isOpen, saving]);

	const handleSwap = useCallback(() => {
		if (!conflict || conflict.conflictWith.type !== "configurable") return;
		const { forAction, pending, conflictWith } = conflict;
		setDraft((prev: ShortcutsConfig) => ({
			...prev,
			[forAction]: pending,
			[conflictWith.action]: prev[forAction],
		}));
		setConflict(null);
	}, [conflict]);

	const handleCancelConflict = useCallback(() => setConflict(null), []);

	const handleSave = useCallback(async () => {
		if (!ready || saving || captureFor || conflict) return;
		setSaving(true);
		setSaveError("");
		try {
			const success = await persistShortcuts(draft);
			if (success) {
				setShortcuts(draft);
				toast.success(t("savedToast"));
				close();
			} else {
				setSaveError(t("registrationFailed"));
			}
		} catch {
			setSaveError(t("saveFailed"));
		} finally {
			setSaving(false);
		}
	}, [draft, setShortcuts, persistShortcuts, close, t, saving, captureFor, conflict, ready]);

	const handleReset = useCallback(() => {
		setDraft({ ...DEFAULT_SHORTCUTS });
		setCaptureFor(null);
		setConflict(null);
		setSaveError("");
	}, []);

	const handleClose = useCallback(() => {
		setCaptureFor(null);
		setConflict(null);
		if (!saving) close();
	}, [close, saving]);

	const content = (
		<div className="flex min-h-0 flex-1 flex-col">
			{!embedded && (
				<DialogHeader className="shrink-0">
					<DialogTitle className="flex items-center gap-2 text-sm">
						<Keyboard className="w-4 h-4 text-[#34B27B]" />
						{t("title")}
					</DialogTitle>
				</DialogHeader>
			)}

			<div
				className={
					embedded
						? "min-h-0 flex-1 overflow-y-auto px-5 py-3"
						: "flex-1 min-h-0 overflow-y-auto pr-1 -mr-1"
				}
			>
				<div className="space-y-0.5">
					<p className="text-xs text-zinc-500 mb-2 font-semibold">{t("configurable")}</p>
					{SHORTCUT_ACTIONS.filter((action) => BLUR_REGIONS_ENABLED || action !== "addBlur").map(
						(action) => {
							const isCapturing = captureFor === action;
							const hasConflict = conflict?.forAction === action;
							return (
								<div key={action}>
									<div className="flex items-center justify-between py-1.5 px-1 border-b border-white/5">
										<span className="text-sm text-slate-300">{t(`actions.${action}`)}</span>
										<button
											type="button"
											data-testid={`shortcut-${action}`}
											aria-label={t(`actions.${action}`)}
											disabled={saving || !ready}
											onClick={() => {
												setConflict(null);
												setCaptureFor(isCapturing ? null : action);
											}}
											title={isCapturing ? t("pressEscToCancel") : t("clickToChange")}
											className={[
												"px-2 py-1 rounded text-xs font-mono border transition-all min-w-[90px] text-center select-none",
												isCapturing
													? "bg-[#34B27B]/20 border-[#34B27B] text-[#34B27B] animate-pulse"
													: hasConflict
														? "bg-amber-500/10 border-amber-500/50 text-amber-400"
														: "bg-white/5 border-white/10 text-slate-200 hover:border-[#34B27B]/50 hover:text-[#34B27B] cursor-pointer",
											].join(" ")}
										>
											{isCapturing ? t("pressKey") : formatBinding(draft[action], isMac)}
										</button>
									</div>
									{hasConflict && conflict?.conflictWith.type === "configurable" && (
										<div className="flex items-center justify-between px-1 py-1.5 mb-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-xs">
											<span className="text-amber-400">
												⚠{" "}
												{t("alreadyUsedBy", {
													action: t(`actions.${conflict.conflictWith.action}`),
												})}
											</span>
											<div className="flex gap-1.5">
												<button
													type="button"
													onClick={handleSwap}
													className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded text-amber-300 font-medium transition-colors"
												>
													{t("swap")}
												</button>
												<button
													type="button"
													onClick={handleCancelConflict}
													className="px-2 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-slate-400 transition-colors"
												>
													{tc("actions.cancel")}
												</button>
											</div>
										</div>
									)}
								</div>
							);
						},
					)}
				</div>

				<div className="space-y-0.5 mt-2">
					<p className="text-xs text-zinc-500 mb-2 font-semibold">{t("fixed")}</p>
					{FIXED_SHORTCUTS.map(({ i18nKey, label, display }) => (
						<div
							key={i18nKey}
							className="flex items-center justify-between py-1.5 px-1 border-b border-white/5 last:border-0"
						>
							<span className="text-sm text-slate-400">
								{t(`fixedActions.${i18nKey}`, { defaultValue: label })}
							</span>
							<kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-xs font-mono text-slate-400 min-w-[90px] text-center">
								{display}
							</kbd>
						</div>
					))}
				</div>

				{saveError && (
					<p role="alert" className="mt-2 text-xs text-red-400">
						{saveError}
					</p>
				)}
			</div>

			<DialogFooter
				className={
					embedded
						? "shrink-0 flex flex-row items-center justify-between gap-2 sm:justify-between border-t border-white/10 px-5 py-3"
						: "shrink-0 flex flex-row items-center justify-between gap-2 sm:justify-between mt-2"
				}
			>
				<Tooltip content={t("resetToDefaults")}>
					<Button
						variant="ghost"
						size="sm"
						className="h-8 w-8 p-0 text-zinc-400"
						aria-label={t("resetToDefaults")}
						onClick={handleReset}
						disabled={saving || !ready}
					>
						<RotateCcw className="h-4 w-4" />
					</Button>
				</Tooltip>
				<div className="flex gap-2">
					<Button variant="ghost" size="sm" disabled={saving} onClick={handleClose}>
						{tc("actions.cancel")}
					</Button>
					<Button
						size="sm"
						className="bg-[#34B27B] hover:bg-[#2d9e6c] text-white"
						onClick={handleSave}
						disabled={!ready || saving || Boolean(captureFor) || Boolean(conflict)}
					>
						{tc("actions.save")}
					</Button>
				</div>
			</DialogFooter>
		</div>
	);
	if (embedded) return content;
	return (
		<Dialog
			open={isConfigOpen}
			onOpenChange={(open) => {
				if (!open) handleClose();
			}}
		>
			<DialogContent className="bg-[#09090b] border-white/10 text-white max-w-[420px] max-h-[85vh] flex flex-col">
				{content}
			</DialogContent>
		</Dialog>
	);
}
