import { LoaderCircle, RefreshCw, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import type { CameraControl } from "@/lib/cameraControls";
import { Switch } from "../ui/switch";
import { Tooltip } from "../ui/tooltip";

interface CameraControlsPanelProps {
	deviceName: string;
	onClose: () => void;
	maxHeight: number;
}

export function CameraControlsPanel({ deviceName, onClose, maxHeight }: CameraControlsPanelProps) {
	const t = useScopedT("launch");
	const [controls, setControls] = useState<CameraControl[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busyControl, setBusyControl] = useState<string | null>(null);

	const loadControls = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await window.electronAPI.getCameraControls(deviceName);
			if (!result.success) throw new Error(result.error || t("webcam.controlsUnavailable"));
			setControls(result.controls ?? []);
		} catch (loadError) {
			setControls([]);
			setError(loadError instanceof Error ? loadError.message : t("webcam.controlsUnavailable"));
		} finally {
			setLoading(false);
		}
	}, [deviceName, t]);

	useEffect(() => {
		void loadControls();
	}, [loadControls]);

	const updateLocalValue = (id: CameraControl["id"], value: number) => {
		setControls((current) =>
			current.map((control) => (control.id === id ? { ...control, value } : control)),
		);
	};

	const applyControl = async (control: CameraControl, value: number, automatic: boolean) => {
		setBusyControl(control.id);
		setError(null);
		try {
			const result = await window.electronAPI.setCameraControl({
				deviceName,
				property: control.id,
				value,
				automatic,
			});
			if (!result.success || !result.control) {
				throw new Error(result.error || t("webcam.controlsUnavailable"));
			}
			setControls((current) =>
				current.map((item) => (item.id === result.control?.id ? result.control : item)),
			);
		} catch (caughtError) {
			setError(
				caughtError instanceof Error ? caughtError.message : t("webcam.controlsUnavailable"),
			);
			void loadControls();
		} finally {
			setBusyControl(null);
		}
	};

	return (
		<div
			data-testid="camera-controls-panel"
			className="z-20 flex w-[320px] max-w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0b0c10]/95 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
			style={{ maxHeight }}
		>
			<div className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 px-3">
				<div className="min-w-0">
					<div className="text-xs font-semibold text-white/90">{t("webcam.cameraControls")}</div>
					<div className="truncate text-[9px] text-white/45">{deviceName}</div>
				</div>
				<div className="flex items-center gap-1">
					<Tooltip content={t("webcam.refreshControls")}>
						<button
							type="button"
							aria-label={t("webcam.refreshControls")}
							className="flex h-7 w-7 items-center justify-center rounded-md text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40"
							disabled={loading}
							onClick={() => void loadControls()}
						>
							<RefreshCw size={14} />
						</button>
					</Tooltip>
					<button
						type="button"
						aria-label={t("webcam.closeControls")}
						className="flex h-7 w-7 items-center justify-center rounded-md text-white/55 hover:bg-white/10 hover:text-white"
						onClick={onClose}
					>
						<X size={15} />
					</button>
				</div>
			</div>

			<div
				data-testid="camera-controls-scroll"
				className="min-h-0 max-h-[360px] overflow-y-auto px-3 py-2"
			>
				{loading ? (
					<div className="flex h-24 items-center justify-center text-white/45">
						<LoaderCircle size={18} className="animate-spin" />
					</div>
				) : error && controls.length === 0 ? (
					<div className="flex h-24 items-center justify-center px-4 text-center text-[11px] leading-5 text-white/55">
						{error}
					</div>
				) : controls.length === 0 ? (
					<div className="flex h-24 items-center justify-center text-[11px] text-white/55">
						{t("webcam.noControls")}
					</div>
				) : (
					<div className="divide-y divide-white/[0.07]">
						{controls.map((control) => {
							const busy = busyControl === control.id;
							return (
								<div key={control.id} className="py-2.5">
									<div className="mb-1.5 flex items-center gap-2">
										<span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/75">
											{control.label}
										</span>
										<span className="w-10 text-right text-[10px] tabular-nums text-white/50">
											{control.value}
										</span>
										{control.autoSupported && (
											<label className="flex items-center gap-1.5 text-[9px] text-white/50">
												{t("webcam.auto")}
												<Switch
													checked={control.automatic}
													disabled={busy}
													onCheckedChange={(checked) =>
														void applyControl(control, control.value, checked)
													}
													className="h-4 w-7 data-[state=checked]:bg-green-500"
												/>
											</label>
										)}
									</div>
									<div className="flex items-center gap-2">
										<input
											type="range"
											min={control.min}
											max={control.max}
											step={control.step}
											value={control.value}
											disabled={busy || control.automatic || !control.manualSupported}
											aria-label={control.label}
											className="h-1.5 min-w-0 flex-1 cursor-pointer accent-green-400 disabled:cursor-not-allowed disabled:opacity-35"
											onChange={(event) => updateLocalValue(control.id, Number(event.target.value))}
											onPointerUp={(event) =>
												void applyControl(control, Number(event.currentTarget.value), false)
											}
											onKeyUp={(event) =>
												void applyControl(control, Number(event.currentTarget.value), false)
											}
										/>
										<Tooltip content={t("webcam.resetControl")}>
											<button
												type="button"
												aria-label={`${t("webcam.resetControl")}: ${control.label}`}
												className="flex h-6 w-6 items-center justify-center rounded-md text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-30"
												disabled={busy || !control.manualSupported}
												onClick={() => void applyControl(control, control.defaultValue, false)}
											>
												<RotateCcw size={12} />
											</button>
										</Tooltip>
									</div>
								</div>
							);
						})}
					</div>
				)}
				{error && controls.length > 0 && (
					<div className="mt-2 border-t border-red-400/20 pt-2 text-[10px] text-red-300/80">
						{error}
					</div>
				)}
			</div>
		</div>
	);
}
