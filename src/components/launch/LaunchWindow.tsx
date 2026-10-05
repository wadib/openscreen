import {
	ChevronDown,
	Clapperboard,
	Columns3,
	Eye,
	EyeOff,
	LoaderCircle,
	Rows3,
	ScanEye,
	Settings2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BsPauseCircle, BsPlayCircle, BsRecordCircle } from "react-icons/bs";
import { FaRegStopCircle } from "react-icons/fa";
import { FaFolderOpen } from "react-icons/fa6";
import { FiMinus, FiX } from "react-icons/fi";
import {
	MdCancel,
	MdMic,
	MdMicOff,
	MdMonitor,
	MdMouse,
	MdRestartAlt,
	MdVideocam,
	MdVideocamOff,
	MdVideoFile,
	MdVolumeOff,
	MdVolumeUp,
} from "react-icons/md";
import { RxDragHandleDots2 } from "react-icons/rx";
import { toast } from "sonner";
import { useI18n, useScopedT } from "@/contexts/I18nContext";
import { useBlurryToggle } from "@/hooks/useBlurryToggle";
import { getLocaleName } from "@/i18n/loader";
import {
	findRestorableRecordingSource,
	loadRecordingPreferences,
	saveRecordingPreferences,
} from "@/lib/recordingPreferences";
import { loadUserPreferences, saveUserPreferences } from "@/lib/userPreferences";
import { nativeBridgeClient } from "@/native";
import { useAudioLevelMeter } from "../../hooks/useAudioLevelMeter";
import { useCameraDevices } from "../../hooks/useCameraDevices";
import { useMicrophoneDevices } from "../../hooks/useMicrophoneDevices";
import { useScreenRecorder } from "../../hooks/useScreenRecorder";
import { requestCameraAccess } from "../../lib/requestCameraAccess";
import { formatTimePadded } from "../../utils/timeUtils";
import { AudioLevelMeter } from "../ui/audio-level-meter";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";
import styles from "./LaunchWindow.module.css";
import { openSourceSelectorWithPermissionRetry } from "./openSourceSelectorFlow";

const ICON_SIZE = 20;

// Vertical tray gap (px): bar's `bottom-5` (20px) plus an 8px gap.
const HUD_DEVICE_POPUP_GAP = 28;
// Horizontal layout: mirrors the `bottom-[68px]` class on the popup element.
const HUD_DEVICE_POPUP_HORIZONTAL_BOTTOM = 68;

const ICON_CONFIG = {
	drag: { icon: RxDragHandleDots2, size: ICON_SIZE },
	monitor: { icon: MdMonitor, size: ICON_SIZE },
	volumeOn: { icon: MdVolumeUp, size: ICON_SIZE },
	volumeOff: { icon: MdVolumeOff, size: ICON_SIZE },
	micOn: { icon: MdMic, size: ICON_SIZE },
	micOff: { icon: MdMicOff, size: ICON_SIZE },
	webcamOn: { icon: MdVideocam, size: ICON_SIZE },
	webcamOff: { icon: MdVideocamOff, size: ICON_SIZE },
	cursor: { icon: MdMouse, size: ICON_SIZE },
	pause: { icon: BsPauseCircle, size: ICON_SIZE },
	resume: { icon: BsPlayCircle, size: ICON_SIZE },
	stop: { icon: FaRegStopCircle, size: ICON_SIZE },
	restart: { icon: MdRestartAlt, size: ICON_SIZE },
	cancel: { icon: MdCancel, size: ICON_SIZE },
	record: { icon: BsRecordCircle, size: ICON_SIZE },
	videoFile: { icon: MdVideoFile, size: ICON_SIZE },
	folder: { icon: FaFolderOpen, size: ICON_SIZE },
	minimize: { icon: FiMinus, size: ICON_SIZE },
	close: { icon: FiX, size: ICON_SIZE },
} as const;

type IconName = keyof typeof ICON_CONFIG;

/** Renders the configured icon for a HUD control. */
function getIcon(name: IconName, className?: string) {
	const { icon: Icon, size } = ICON_CONFIG[name];
	return <Icon size={size} className={className} />;
}

const hudGroupClasses =
	"flex items-center gap-0.5 rounded-xl border border-white/[0.07] bg-white/[0.045] transition-colors duration-150 hover:bg-white/[0.075]";

const hudIconBtnClasses =
	"flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 cursor-pointer text-white hover:bg-white/10 active:scale-95";

const hudAuxIconBtnClasses =
	"flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 text-white/55 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed";

const windowBtnClasses =
	"flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 cursor-pointer opacity-50 hover:opacity-90 hover:bg-white/[0.08]";

const hudSidebarClasses = "ml-0.5 pl-1.5 border-l border-white/10 flex items-center gap-0.5";
const hudSidebarVerticalClasses =
	"mt-0.5 pt-1.5 border-t border-white/10 flex flex-col items-center gap-0.5";

/** Launches the floating recording HUD and its recorder controls. */
export function LaunchWindow() {
	const t = useScopedT("launch");
	const blurT = useScopedT("settings");
	const { systemLocaleSuggestion, acceptSystemLocaleSuggestion, dismissSystemLocaleSuggestion } =
		useI18n();
	const suggestedLanguageName = systemLocaleSuggestion ? getLocaleName(systemLocaleSuggestion) : "";

	const {
		recording,
		countdownActive,
		paused,
		elapsedSeconds,
		toggleRecording,
		togglePaused,
		canPauseRecording,
		restartRecording,
		cancelRecording,
		microphoneEnabled,
		setMicrophoneEnabled,
		microphoneGain,
		setMicrophoneGain,
		microphoneDeviceId,
		setMicrophoneDeviceId,
		setMicrophoneDeviceName,
		systemAudioEnabled,
		setSystemAudioEnabled,
		webcamEnabled,
		setWebcamEnabled,
		webcamDeviceId,
		setWebcamDeviceId,
		setWebcamDeviceName,
		cursorCaptureMode,
		setCursorCaptureMode,
	} = useScreenRecorder();

	const showMicControls = microphoneEnabled && !recording && !countdownActive;
	const showWebcamControls = webcamEnabled && !recording && !countdownActive;

	const [isMicHovered, setIsMicHovered] = useState(false);
	const [isMicFocused, setIsMicFocused] = useState(false);
	const micExpanded = isMicHovered || isMicFocused;

	const [isWebcamHovered, setIsWebcamHovered] = useState(false);
	const [isWebcamFocused, setIsWebcamFocused] = useState(false);
	const webcamExpanded = isWebcamHovered || isWebcamFocused;
	const [trayLayout, setTrayLayout] = useState<"horizontal" | "vertical">(
		() => loadUserPreferences().trayLayout,
	);
	const [supportsCursorModeToggle, setSupportsCursorModeToggle] = useState(false);
	const [previewSupported, setPreviewSupported] = useState(false);
	const blurry = useBlurryToggle(previewSupported);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewSelected, setPreviewSelected] = useState(
		() => loadRecordingPreferences().previewEnabled,
	);
	const [previewBusy, setPreviewBusy] = useState(false);
	const previewBusyRef = useRef(false);
	const previewRestoreAttempted = useRef(false);
	const wasRecording = useRef(recording);
	const visibleCursorMode = useRef<"editable-overlay" | "system">(
		cursorCaptureMode === "system" ? "system" : "editable-overlay",
	);
	const hudBarRef = useRef<HTMLDivElement | null>(null);
	const deviceSelectorRef = useRef<HTMLDivElement | null>(null);
	// Measured bar height, anchors the popups above the tall vertical tray so they don't overlap it.
	const [hudBarHeight, setHudBarHeight] = useState(0);

	const {
		devices: micDevices,
		selectedDeviceId: selectedMicId,
		setSelectedDeviceId: setSelectedMicId,
	} = useMicrophoneDevices(microphoneEnabled, microphoneDeviceId);
	const {
		devices: cameraDevices,
		selectedDeviceId: selectedCameraId,
		setSelectedDeviceId: setSelectedCameraId,
		isLoading: isCameraDevicesLoading,
		error: cameraDevicesError,
	} = useCameraDevices(webcamEnabled, webcamDeviceId);

	const selectedMicLabel =
		micDevices.find((d) => d.deviceId === (microphoneDeviceId || selectedMicId))?.label ||
		t("audio.defaultMicrophone");
	const selectedCameraDevice = cameraDevices.find(
		(d) => d.deviceId === (webcamDeviceId || selectedCameraId),
	);
	const selectedCameraLabel = isCameraDevicesLoading
		? t("webcam.searching")
		: cameraDevicesError
			? t("webcam.unavailable")
			: cameraDevices.length === 0
				? t("webcam.noneFound")
				: selectedCameraDevice?.label || t("webcam.defaultCamera");

	const { level } = useAudioLevelMeter({
		enabled: showMicControls,
		deviceId: microphoneDeviceId,
	});

	useEffect(() => {
		if (selectedMicId) {
			setMicrophoneDeviceId(selectedMicId);
			const device = micDevices.find((d) => d.deviceId === selectedMicId);
			if (device) setMicrophoneDeviceName(device.label);
		}
	}, [selectedMicId, micDevices, setMicrophoneDeviceId, setMicrophoneDeviceName]);

	useEffect(() => {
		if (selectedCameraId) {
			setWebcamDeviceId(selectedCameraId);
			const device = cameraDevices.find((d) => d.deviceId === selectedCameraId);
			if (device) setWebcamDeviceName(device.label);
		}
	}, [selectedCameraId, cameraDevices, setWebcamDeviceId, setWebcamDeviceName]);

	useEffect(() => {
		let cancelled = false;
		nativeBridgeClient.system
			.getPlatform()
			.then((platform) => {
				if (!cancelled) {
					setSupportsCursorModeToggle(platform === "win32" || platform === "darwin");
				}
			})
			.catch(() => {
				if (!cancelled) {
					setSupportsCursorModeToggle(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!import.meta.env.DEV) {
			return;
		}

		void requestCameraAccess().catch((error) => {
			console.warn("Failed to trigger camera access request during development:", error);
		});
	}, []);

	// Resize the overlay window to fit content, else the taller vertical tray gets clipped
	// and scrolls. Measure from the window's bottom-centre (the anchor the main process
	// preserves) so fixed bottom/centre offsets keep this stable and it doesn't oscillate.
	const lastHudSizeRef = useRef({ width: 0, height: 0 });
	const measureHudSize = useCallback(() => {
		const barEl = hudBarRef.current;
		if (!barEl || !window.electronAPI?.setHudOverlaySize) return;

		// Breathing room so the drop shadow isn't clipped. TOP_MARGIN must also exceed the
		// slack in the bar's `max-h: calc(100vh - 2.5rem)` cap (40px reserved - 20px bottom
		// gap = 20px) so the window stays tall enough that the cap never engages and adds a scrollbar.
		const SIDE_MARGIN = 24;
		const TOP_MARGIN = 24;
		// Leave room for device selectors even when the bar is narrow.
		const MIN_WIDTH = 220;

		const viewportHeight = window.innerHeight;

		// Use natural (scroll) size, not the clipped box: vertical mode's max-h cap is a
		// small-screen fallback, and reading clipped height would pin the window to it.
		// scrollHeight gives full content height; the cap only engages when the main process clamps to screen.
		let topFromBottom = viewportHeight - barEl.getBoundingClientRect().bottom + barEl.scrollHeight;
		let halfWidth = barEl.scrollWidth / 2;

		// Popups drive both dimensions too. Their vertical anchor depends on bar height,
		// which is fed back through React state and lags by a frame, so derive their top
		// edge from the bar's natural height instead of the stale rendered position. Keeps
		// one measurement pass authoritative and avoids a feedback re-measure.
		if (deviceSelectorRef.current) {
			const rect = deviceSelectorRef.current.getBoundingClientRect();
			if (rect.width !== 0 || rect.height !== 0) {
				const popupBottomOffset =
					trayLayout === "vertical"
						? barEl.scrollHeight + HUD_DEVICE_POPUP_GAP
						: HUD_DEVICE_POPUP_HORIZONTAL_BOTTOM;
				topFromBottom = Math.max(topFromBottom, popupBottomOffset + rect.height);
				halfWidth = Math.max(halfWidth, rect.width / 2);
			}
		}

		setHudBarHeight((prev) => {
			const next = Math.round(barEl.scrollHeight);
			return Math.abs(prev - next) > 1 ? next : prev;
		});

		const width = Math.max(MIN_WIDTH, Math.ceil(halfWidth * 2) + SIDE_MARGIN);
		const height = Math.ceil(topFromBottom) + TOP_MARGIN;
		if (width === lastHudSizeRef.current.width && height === lastHudSizeRef.current.height) {
			return;
		}
		lastHudSizeRef.current = { width, height };
		window.electronAPI.setHudOverlaySize(width, height);
	}, [trayLayout]);

	// One persistent observer; elements wire themselves up via callback refs as they
	// mount/unmount so measurement re-runs without recreating it or threading mount state through deps.
	const hudResizeObserverRef = useRef<ResizeObserver | null>(null);
	useEffect(() => {
		const observer = new ResizeObserver(() => measureHudSize());
		hudResizeObserverRef.current = observer;
		if (hudBarRef.current) observer.observe(hudBarRef.current);
		if (deviceSelectorRef.current) observer.observe(deviceSelectorRef.current);
		measureHudSize();
		return () => {
			observer.disconnect();
			hudResizeObserverRef.current = null;
		};
	}, [measureHudSize]);

	const observeHudElement = useCallback(
		<T extends HTMLElement>(el: T | null, ref: React.MutableRefObject<T | null>) => {
			const observer = hudResizeObserverRef.current;
			if (ref.current && observer) observer.unobserve(ref.current);
			ref.current = el;
			if (el && observer) observer.observe(el);
			measureHudSize();
		},
		[measureHudSize],
	);
	const setHudBarEl = useCallback(
		(el: HTMLDivElement | null) => observeHudElement(el, hudBarRef),
		[observeHudElement],
	);
	const setDeviceSelectorEl = useCallback(
		(el: HTMLDivElement | null) => observeHudElement(el, deviceSelectorRef),
		[observeHudElement],
	);

	const hudMouseEventsEnabledRef = useRef<boolean | undefined>(undefined);
	const setHudMouseEventsEnabled = useCallback((enabled: boolean) => {
		if (hudMouseEventsEnabledRef.current === enabled) {
			return;
		}
		hudMouseEventsEnabledRef.current = enabled;
		window.electronAPI?.setHudOverlayIgnoreMouseEvents?.(!enabled);
	}, []);

	useEffect(() => {
		setHudMouseEventsEnabled(false);
		return () => {
			window.electronAPI?.setHudOverlayIgnoreMouseEvents?.(false);
		};
	}, [setHudMouseEventsEnabled]);

	const [selectedSource, setSelectedSource] = useState("Screen");
	const [hasSelectedSource, setHasSelectedSource] = useState(false);
	const [, setRecordPointerDownCount] = useState(0);

	useEffect(() => {
		let cancelled = false;
		let changed = false;
		const unsubscribe = window.electronAPI.onRecordingPreviewChanged((open) => {
			changed = true;
			setPreviewOpen(open);
		});
		void window.electronAPI
			.getRecordingPreviewState()
			.then((state) => {
				if (cancelled) return;
				setPreviewSupported(state.supported);
				if (!changed) setPreviewOpen(state.open);
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, []);

	const openSelectedPreview = useCallback(async () => {
		if (!previewSelected || previewOpen || previewBusyRef.current) return;
		previewBusyRef.current = true;
		setPreviewBusy(true);
		try {
			const state = await window.electronAPI.getRecordingPreviewState();
			const result = state.open
				? { success: true, open: true }
				: await window.electronAPI.toggleRecordingPreview();
			setPreviewOpen(result.open);
			if (!result.success) toast.error(t("preview.unavailable"));
		} catch {
			toast.error(t("preview.unavailable"));
		} finally {
			previewBusyRef.current = false;
			setPreviewBusy(false);
		}
	}, [previewOpen, previewSelected, t]);

	const togglePreview = async () => {
		if (previewBusyRef.current) return;
		const nextSelected = !previewSelected;
		if (nextSelected && previewOpen) {
			setPreviewSelected(true);
			saveRecordingPreferences({ previewEnabled: true });
			return;
		}
		if (!nextSelected) {
			setPreviewSelected(false);
			saveRecordingPreferences({ previewEnabled: false });
			if (!previewOpen) return;
		}
		previewBusyRef.current = true;
		setPreviewBusy(true);
		try {
			const result = await window.electronAPI.toggleRecordingPreview();
			setPreviewOpen(result.open);
			if (nextSelected && result.success && result.open) {
				setPreviewSelected(true);
				saveRecordingPreferences({ previewEnabled: true });
			} else if (!result.success) {
				toast.error(t("preview.unavailable"));
			}
		} catch {
			toast.error(t("preview.unavailable"));
		} finally {
			previewBusyRef.current = false;
			setPreviewBusy(false);
		}
	};

	useEffect(() => {
		let restoreAttempted = false;
		const checkSelectedSource = async () => {
			if (window.electronAPI) {
				let source = await window.electronAPI.getSelectedSource();
				if (!source && !restoreAttempted) {
					restoreAttempted = true;
					const preferred = loadRecordingPreferences().selectedSource;
					if (preferred) {
						const sources = await window.electronAPI.getSources({
							types: ["screen", "window"],
							thumbnailSize: { width: 0, height: 0 },
							fetchWindowIcons: false,
						});
						const restored = findRestorableRecordingSource(sources, preferred);
						if (restored) source = await window.electronAPI.selectSource(restored);
					}
				}
				if (source) {
					setSelectedSource(source.name);
					setHasSelectedSource(true);
				} else {
					setSelectedSource("Screen");
					setHasSelectedSource(false);
				}
			}
		};

		checkSelectedSource();

		const interval = setInterval(checkSelectedSource, 500);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		if (
			previewSupported &&
			hasSelectedSource &&
			previewSelected &&
			!previewRestoreAttempted.current
		) {
			previewRestoreAttempted.current = true;
			void openSelectedPreview();
		}
	}, [hasSelectedSource, openSelectedPreview, previewSelected, previewSupported]);

	useEffect(() => {
		if (recording && !wasRecording.current && previewSelected && !previewOpen) {
			void openSelectedPreview();
		}
		wasRecording.current = recording;
	}, [openSelectedPreview, previewOpen, previewSelected, recording]);

	const openSourceSelector = async () => {
		if (window.electronAPI) {
			await openSourceSelectorWithPermissionRetry({
				openSourceSelector: () => window.electronAPI.openSourceSelector(),
				requestScreenAccess: () => window.electronAPI.requestScreenAccess(),
			});
		}
	};

	const sendHudOverlayHide = () => {
		if (window.electronAPI && window.electronAPI.hudOverlayHide) {
			window.electronAPI.hudOverlayHide();
		}
	};
	const sendHudOverlayClose = () => {
		if (window.electronAPI && window.electronAPI.hudOverlayClose) {
			window.electronAPI.hudOverlayClose();
		}
	};
	/** Switches the HUD between horizontal and vertical tray layouts. */
	const toggleTrayLayout = () => {
		const nextLayout = trayLayout === "horizontal" ? "vertical" : "horizontal";
		setTrayLayout(nextLayout);
		saveUserPreferences({ trayLayout: nextLayout });
	};

	const toggleMicrophone = () => {
		if (!recording) {
			setMicrophoneEnabled(!microphoneEnabled);
		}
	};
	const dragLastPositionRef = useRef<{ x: number; y: number } | null>(null);
	const handleHudDragPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setHudMouseEventsEnabled(true);
		event.currentTarget.setPointerCapture(event.pointerId);
		dragLastPositionRef.current = { x: event.screenX, y: event.screenY };
	};
	const handleHudDragPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const lastPosition = dragLastPositionRef.current;
		if (!lastPosition) return;
		const deltaX = event.screenX - lastPosition.x;
		const deltaY = event.screenY - lastPosition.y;
		dragLastPositionRef.current = { x: event.screenX, y: event.screenY };
		window.electronAPI?.moveHudOverlayBy?.(deltaX, deltaY);
	};
	const handleHudDragPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
		dragLastPositionRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		setHudMouseEventsEnabled(false);
	};

	return (
		// Avoid w-screen/h-screen: 100vw can exceed the inner layout width when scrollbars
		// affect the viewport (Windows), causing a horizontal scrollbar (issue #305).
		<div
			className={`h-full w-full min-w-0 max-w-full overflow-x-hidden overflow-y-hidden bg-transparent ${styles.electronDrag}`}
			onPointerMove={(event) => {
				const target = event.target as HTMLElement | null;
				const shouldCapture = Boolean(target?.closest("[data-hud-interactive='true']"));
				setHudMouseEventsEnabled(shouldCapture);
			}}
			onPointerLeave={() => setHudMouseEventsEnabled(false)}
		>
			{systemLocaleSuggestion && (
				<div
					data-hud-interactive="true"
					className={`fixed top-8 left-1/2 z-30 w-[calc(100vw-1rem)] max-w-[520px] -translate-x-1/2 rounded-xl border border-white/15 bg-[rgba(20,20,28,0.95)] p-3 shadow-2xl backdrop-blur-xl text-white animate-in fade-in-0 zoom-in-95 duration-200 ${styles.electronNoDrag}`}
				>
					<div className="text-[13px] font-semibold text-white">
						{t("systemLanguagePrompt.title")}
					</div>
					<div className="mt-1 text-[11px] leading-relaxed text-white/75">
						{t("systemLanguagePrompt.description", {
							language: suggestedLanguageName,
						})}
					</div>
					<div className="mt-3 flex items-center justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={dismissSystemLocaleSuggestion}
							className="h-7 text-xs text-white/80 hover:bg-white/10 hover:text-white"
						>
							{t("systemLanguagePrompt.keepDefault")}
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={acceptSystemLocaleSuggestion}
							className="h-7 text-xs bg-white text-[#10121b] hover:bg-white/90"
						>
							{t("systemLanguagePrompt.switch", {
								language: suggestedLanguageName,
							})}
						</Button>
					</div>
				</div>
			)}

			{/* Device selectors, fixed above HUD bar, viewport-relative, never clipped */}
			{(showMicControls || showWebcamControls) && (
				<div
					ref={setDeviceSelectorEl}
					data-hud-interactive="true"
					className={`fixed left-1/2 -translate-x-1/2 flex items-center gap-2 animate-mic-panel-in ${trayLayout === "vertical" ? "" : "bottom-[68px]"} ${styles.electronNoDrag}`}
					style={
						trayLayout === "vertical"
							? // Sit above the tall vertical tray, anchored to the measured bar
								// height. Matches the offset in measureHudSize.
								{ bottom: hudBarHeight + HUD_DEVICE_POPUP_GAP }
							: undefined
					}
				>
					{/* Mic selector */}
					{showMicControls && (
						<div
							className={`flex h-9 items-center gap-2 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0c10]/90 px-3 py-1.5 shadow-[0_18px_42px_rgba(0,0,0,0.4)] backdrop-blur-2xl transition-all duration-300 ${!micExpanded ? "opacity-60 grayscale-[0.5]" : "opacity-100"}`}
							onMouseEnter={() => setIsMicHovered(true)}
							onMouseLeave={() => setIsMicHovered(false)}
							onFocus={() => setIsMicFocused(true)}
							onBlur={() => setIsMicFocused(false)}
							style={{ width: micExpanded ? "330px" : "140px", transition: "width 300ms ease" }}
						>
							<div className="relative flex-1 min-w-0">
								{!micExpanded && (
									<div className="text-white/60 text-[10px] font-medium truncate">
										{selectedMicLabel}
									</div>
								)}
								<select
									value={microphoneDeviceId || selectedMicId}
									onChange={(e) => {
										const selectedDevice = micDevices.find((d) => d.deviceId === e.target.value);
										setSelectedMicId(e.target.value);
										setMicrophoneDeviceId(e.target.value);
										setMicrophoneDeviceName(selectedDevice?.label);
									}}
									className={`w-full appearance-none bg-white/5 text-white text-[11px] rounded-lg pl-2 pr-6 py-1 border border-white/10 outline-none hover:bg-white/10 transition-colors cursor-pointer ${!micExpanded ? "sr-only" : ""}`}
								>
									{micDevices.map((device) => (
										<option key={device.deviceId} value={device.deviceId} className="bg-[#1c1c24]">
											{device.label}
										</option>
									))}
								</select>
								{micExpanded && (
									<ChevronDown
										size={12}
										className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
									/>
								)}
							</div>
							{micExpanded && (
								<div className="flex w-[92px] shrink-0 items-center gap-1.5">
									<input
										type="range"
										min="0"
										max="200"
										step="5"
										value={Math.round(microphoneGain * 100)}
										onChange={(event) => setMicrophoneGain(Number(event.target.value) / 100)}
										aria-label={t("audio.microphoneLevel")}
										title={t("audio.microphoneLevel")}
										className="h-1.5 min-w-0 flex-1 cursor-pointer accent-green-400"
									/>
									<span className="w-8 text-right text-[9px] tabular-nums text-white/55">
										{Math.round(microphoneGain * 100)}%
									</span>
								</div>
							)}
							<AudioLevelMeter
								level={level}
								className={`${micExpanded ? "w-16" : "w-8"} h-2 transition-all duration-300`}
							/>
						</div>
					)}

					{/* Webcam selector */}
					{showWebcamControls && (
						<div
							className={`flex h-9 items-center gap-2 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0c10]/90 px-3 py-1.5 shadow-[0_18px_42px_rgba(0,0,0,0.4)] backdrop-blur-2xl transition-all duration-300 ${!webcamExpanded ? "opacity-60 grayscale-[0.5]" : "opacity-100"}`}
							onMouseEnter={() => setIsWebcamHovered(true)}
							onMouseLeave={() => setIsWebcamHovered(false)}
							onFocus={() => setIsWebcamFocused(true)}
							onBlur={() => setIsWebcamFocused(false)}
							style={{ width: webcamExpanded ? "240px" : "140px", transition: "width 300ms ease" }}
						>
							<div className="relative flex-1 min-w-0">
								{!webcamExpanded && (
									<div className="text-white/60 text-[10px] font-medium truncate">
										{selectedCameraLabel}
									</div>
								)}
								{webcamExpanded &&
									(isCameraDevicesLoading ? (
										<span className="text-white/40 text-[10px] italic">
											{t("webcam.searching")}
										</span>
									) : cameraDevicesError ? (
										<span className="text-white/40 text-[10px] italic">
											{t("webcam.unavailable")}
										</span>
									) : cameraDevices.length === 0 ? (
										<span className="text-white/40 text-[10px] italic">
											{t("webcam.noneFound")}
										</span>
									) : (
										<>
											<select
												value={webcamDeviceId || selectedCameraId}
												onChange={(e) => {
													const device = cameraDevices.find(
														(item) => item.deviceId === e.target.value,
													);
													setSelectedCameraId(e.target.value);
													setWebcamDeviceId(e.target.value);
													setWebcamDeviceName(device?.label);
												}}
												className="w-full appearance-none bg-white/5 text-white text-[11px] rounded-lg pl-2 pr-6 py-1 border border-white/10 outline-none hover:bg-white/10 transition-colors cursor-pointer"
											>
												{cameraDevices.map((device) => (
													<option
														key={device.deviceId}
														value={device.deviceId}
														className="bg-[#1c1c24]"
													>
														{device.label}
													</option>
												))}
											</select>
											<ChevronDown
												size={12}
												className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
											/>
										</>
									))}
								{(!webcamExpanded || cameraDevices.length === 0) && (
									<select
										value={webcamDeviceId || selectedCameraId}
										onChange={(e) => {
											const device = cameraDevices.find((item) => item.deviceId === e.target.value);
											setSelectedCameraId(e.target.value);
											setWebcamDeviceId(e.target.value);
											setWebcamDeviceName(device?.label);
										}}
										className="sr-only"
									>
										{cameraDevices.map((device) => (
											<option key={device.deviceId} value={device.deviceId}>
												{device.label}
											</option>
										))}
									</select>
								)}
							</div>
						</div>
					)}
				</div>
			)}

			{/* HUD bar, fixed at bottom center, viewport-relative, never moves */}
			<div
				ref={setHudBarEl}
				data-hud-interactive="true"
				data-tray-layout={trayLayout}
				className={`fixed bottom-5 left-1/2 -translate-x-1/2 flex rounded-2xl border border-white/[0.10] bg-[#07080a]/90 shadow-[0_20px_60px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl backdrop-saturate-[140%] ${
					trayLayout === "vertical"
						? "max-h-[calc(100vh-2.5rem)] flex-col items-center gap-1 overflow-y-auto px-1 py-1.5"
						: "items-center gap-1.5 px-2 py-1.5"
				}`}
				onPointerEnter={() => setHudMouseEventsEnabled(true)}
				onPointerDown={() => setHudMouseEventsEnabled(true)}
				onMouseEnter={() => setHudMouseEventsEnabled(true)}
				onMouseLeave={() => setHudMouseEventsEnabled(false)}
			>
				{/* Drag handle */}
				<div
					className={`flex ${trayLayout === "vertical" ? "h-6 w-8" : "h-8 w-7"} cursor-grab items-center justify-center active:cursor-grabbing ${styles.electronNoDrag}`}
					onPointerDown={handleHudDragPointerDown}
					onPointerMove={handleHudDragPointerMove}
					onPointerUp={handleHudDragPointerEnd}
					onPointerCancel={handleHudDragPointerEnd}
				>
					{getIcon("drag", "text-white/30")}
				</div>

				<Tooltip
					content={
						trayLayout === "horizontal"
							? t("tooltips.useVerticalTray")
							: t("tooltips.useHorizontalTray")
					}
				>
					<button
						data-testid="launch-tray-layout-button"
						type="button"
						aria-label={
							trayLayout === "horizontal"
								? t("tooltips.useVerticalTray")
								: t("tooltips.useHorizontalTray")
						}
						aria-pressed={trayLayout === "vertical"}
						className={`${hudIconBtnClasses} ${styles.electronNoDrag}`}
						onClick={toggleTrayLayout}
					>
						{trayLayout === "horizontal" ? (
							<Columns3 size={ICON_SIZE} className="text-white/60" />
						) : (
							<Rows3 size={ICON_SIZE} className="text-white/60" />
						)}
					</button>
				</Tooltip>

				{/* Source selector */}
				<button
					data-testid="launch-source-selector-button"
					className={`${hudGroupClasses} h-8 ${trayLayout === "vertical" ? "w-8 justify-center px-0" : "px-2.5"} ${styles.electronNoDrag}`}
					onClick={openSourceSelector}
					disabled={recording || countdownActive}
					title={selectedSource}
					aria-label={selectedSource}
				>
					{getIcon("monitor", "text-white/80")}
					<span
						className={`${trayLayout === "vertical" ? "sr-only" : "max-w-[86px]"} truncate text-[11px] font-medium text-white/75`}
					>
						{selectedSource}
					</span>
				</button>

				{/* Audio controls group */}
				{previewSupported && (
					<Tooltip content={t(previewSelected ? "preview.close" : "preview.open")}>
						<button
							type="button"
							data-testid="launch-recording-preview-button"
							aria-label={t(previewSelected ? "preview.close" : "preview.open")}
							aria-pressed={previewSelected}
							className={`${hudIconBtnClasses} ${styles.electronNoDrag} ${previewSelected ? "bg-green-400/10 drop-shadow-[0_0_4px_rgba(74,222,128,0.4)]" : ""}`}
							disabled={previewBusy || (!hasSelectedSource && !previewSelected)}
							onClick={togglePreview}
						>
							{previewSelected ? (
								<EyeOff size={ICON_SIZE} className="text-green-400" />
							) : (
								<Eye size={ICON_SIZE} className="text-white/70" />
							)}
						</button>
					</Tooltip>
				)}

				<div
					className={`${hudGroupClasses} ${trayLayout === "vertical" ? "flex-col py-1" : ""} ${styles.electronNoDrag}`}
				>
					<button
						data-testid="launch-system-audio-button"
						className={`${hudIconBtnClasses} ${systemAudioEnabled ? "drop-shadow-[0_0_4px_rgba(74,222,128,0.4)]" : ""}`}
						onClick={() => !recording && setSystemAudioEnabled(!systemAudioEnabled)}
						disabled={recording || countdownActive}
						title={
							systemAudioEnabled ? t("audio.disableSystemAudio") : t("audio.enableSystemAudio")
						}
					>
						{systemAudioEnabled
							? getIcon("volumeOn", "text-green-400")
							: getIcon("volumeOff", "text-white/40")}
					</button>
					<button
						data-testid="launch-microphone-button"
						className={`${hudIconBtnClasses} ${microphoneEnabled ? "drop-shadow-[0_0_4px_rgba(74,222,128,0.4)]" : ""}`}
						onClick={toggleMicrophone}
						disabled={recording || countdownActive}
						title={microphoneEnabled ? t("audio.disableMicrophone") : t("audio.enableMicrophone")}
						onPointerDown={() => {
							setRecordPointerDownCount((count) => count + 1);
						}}
					>
						{microphoneEnabled
							? getIcon("micOn", "text-green-400")
							: getIcon("micOff", "text-white/40")}
					</button>
					<button
						data-testid="launch-webcam-button"
						className={`${hudIconBtnClasses} ${webcamEnabled ? "drop-shadow-[0_0_4px_rgba(74,222,128,0.4)]" : ""}`}
						onClick={async () => {
							await setWebcamEnabled(!webcamEnabled);
						}}
						disabled={recording || countdownActive}
						title={webcamEnabled ? t("webcam.disableWebcam") : t("webcam.enableWebcam")}
					>
						{webcamEnabled
							? getIcon("webcamOn", "text-green-400")
							: getIcon("webcamOff", "text-white/40")}
					</button>
					{previewSupported && (
						<Tooltip content={blurT("annotation.typeBlur")}>
							<button
								type="button"
								data-testid="launch-live-blur-button"
								aria-label={blurT("annotation.typeBlur")}
								aria-pressed={blurry.selected}
								disabled={blurry.busy}
								className={`${hudIconBtnClasses} ${styles.electronNoDrag} ${blurry.selected ? "bg-green-400/10 drop-shadow-[0_0_4px_rgba(74,222,128,0.4)]" : ""}`}
								onClick={() => void blurry.toggle()}
							>
								<ScanEye
									size={ICON_SIZE}
									className={blurry.selected ? "text-green-400" : "text-white/70"}
								/>
							</button>
						</Tooltip>
					)}
					{supportsCursorModeToggle && (
						<div className="flex items-center">
							<button
								data-testid="launch-cursor-mode-button"
								aria-pressed={cursorCaptureMode !== "hidden"}
								aria-label={t(cursorCaptureMode === "hidden" ? "cursor.show" : "cursor.hide")}
								className={`${hudIconBtnClasses} ${
									cursorCaptureMode !== "hidden" ? "drop-shadow-[0_0_4px_rgba(74,222,128,0.4)]" : ""
								}`}
								onClick={() =>
									!recording &&
									setCursorCaptureMode(
										cursorCaptureMode === "hidden" ? visibleCursorMode.current : "hidden",
									)
								}
								disabled={recording || countdownActive}
								title={t(cursorCaptureMode === "hidden" ? "cursor.show" : "cursor.hide")}
							>
								{getIcon(
									"cursor",
									cursorCaptureMode !== "hidden" ? "text-green-400" : "text-white/40",
								)}
							</button>
							<Tooltip content={t("cursor.mode")}>
								<button
									type="button"
									data-testid="launch-cursor-options-button"
									aria-label={t("cursor.mode")}
									className="flex h-7 w-4 items-center justify-center rounded-sm text-white/60 hover:bg-white/10 disabled:opacity-40"
									disabled={recording || countdownActive}
									onClick={async () => {
										const mode = await window.electronAPI.chooseRecordingCursorMode(
											visibleCursorMode.current,
											[t("cursor.useEditableCursor"), t("cursor.useSystemCursor")],
										);
										if (mode) {
											visibleCursorMode.current = mode;
											setCursorCaptureMode(mode);
										}
									}}
								>
									<ChevronDown size={12} />
								</button>
							</Tooltip>
						</div>
					)}
				</div>

				{/* Record/Stop group */}
				<button
					data-testid="launch-record-button"
					aria-busy={countdownActive}
					className={`flex items-center justify-center rounded-full p-2 transition-[min-width,background-color] duration-150 ${recording ? "min-w-[78px]" : "min-w-[36px]"} ${trayLayout === "vertical" ? "min-h-9" : ""} ${styles.electronNoDrag} ${
						recording
							? paused
								? "bg-amber-500/10 hover:bg-amber-500/15"
								: "bg-red-500/12 hover:bg-red-500/16"
							: "bg-white/[0.06] hover:bg-white/[0.10]"
					}`}
					onClick={toggleRecording}
					disabled={!hasSelectedSource && !recording}
					style={{ flex: "0 0 auto" }}
				>
					<div className={`flex items-center justify-center ${recording ? "gap-1.5" : ""}`}>
						{recording ? (
							getIcon("stop", paused ? "text-amber-400" : "text-red-400")
						) : countdownActive ? (
							<LoaderCircle size={ICON_SIZE} className="animate-spin text-white/80" />
						) : (
							getIcon("record", hasSelectedSource ? "text-white/80" : "text-white/30")
						)}
						{recording && (
							<span
								className={`${paused ? "text-amber-400" : "text-red-400"} inline-block w-[34px] text-left text-xs font-semibold tabular-nums`}
							>
								{formatTimePadded(elapsedSeconds)}
							</span>
						)}
					</div>
				</button>

				{recording && (
					<div
						className={`flex items-center gap-0.5 ${trayLayout === "vertical" ? "flex-col" : ""} ${styles.electronNoDrag}`}
					>
						{canPauseRecording && (
							<Tooltip
								content={paused ? t("tooltips.resumeRecording") : t("tooltips.pauseRecording")}
							>
								<button
									type="button"
									data-testid="launch-pause-button"
									aria-label={paused ? t("tooltips.resumeRecording") : t("tooltips.pauseRecording")}
									className={hudAuxIconBtnClasses}
									onClick={togglePaused}
								>
									{getIcon(
										paused ? "resume" : "pause",
										paused ? "text-amber-400" : "text-white/60",
									)}
								</button>
							</Tooltip>
						)}
						<Tooltip content={t("tooltips.restartRecording")}>
							<button className={hudAuxIconBtnClasses} onClick={restartRecording}>
								{getIcon("restart", "text-white/60")}
							</button>
						</Tooltip>
						<Tooltip content={t("tooltips.cancelRecording")}>
							<button className={hudAuxIconBtnClasses} onClick={cancelRecording}>
								{getIcon("cancel", "text-white/60")}
							</button>
						</Tooltip>
					</div>
				)}

				{!recording && (
					<Tooltip content={t("settings.title")}>
						<button
							type="button"
							aria-label={t("settings.title")}
							data-testid="launch-settings-button"
							disabled={countdownActive}
							className={`${hudAuxIconBtnClasses} ${styles.electronNoDrag}`}
							onClick={() => void window.electronAPI.configureAfterRecording().catch(console.error)}
						>
							<Settings2 size={ICON_SIZE} />
						</button>
					</Tooltip>
				)}

				{!recording && (
					<Tooltip content={t("tooltips.openStudio")}>
						<button
							data-testid="launch-open-studio-button"
							disabled={countdownActive}
							className={`${hudIconBtnClasses} ${styles.electronNoDrag}`}
							onClick={() => window.electronAPI.switchToEditor()}
						>
							<Clapperboard size={ICON_SIZE} className="text-white/60" />
						</button>
					</Tooltip>
				)}

				{/* Right sidebar controls */}
				<div
					className={`${trayLayout === "vertical" ? hudSidebarVerticalClasses : hudSidebarClasses} ${styles.electronNoDrag}`}
				>
					{/* Window controls */}
					<div
						className={`flex items-center gap-0.5 ${trayLayout === "vertical" ? "flex-col" : ""}`}
					>
						<button
							className={windowBtnClasses}
							title={t("tooltips.hideHUD")}
							onClick={sendHudOverlayHide}
						>
							{getIcon("minimize", "text-white")}
						</button>
						<button
							className={windowBtnClasses}
							title={t("tooltips.closeApp")}
							onClick={sendHudOverlayClose}
						>
							{getIcon("close", "text-white")}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
