import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { NativeMacRecordingRequest } from "../src/lib/nativeMacRecording";
import type { NativeWindowsRecordingRequest } from "../src/lib/nativeWindowsRecording";
import type { RecordingPreviewSettings, WebcamPreviewSignal } from "../src/lib/recordingPreview";
import type { RecordingSession, StoreRecordedSessionInput } from "../src/lib/recordingSession";
import { NATIVE_BRIDGE_CHANNEL, type NativeBridgeRequest } from "../src/native/contracts";

// Asset base URL is passed from the main process via webPreferences.additionalArguments
// (see windows.ts). Sandboxed preloads cannot import node:path / node:url, so we
// can't compute it here.
const ASSET_BASE_URL_ARG_PREFIX = "--asset-base-url=";
const assetBaseUrlArg = process.argv.find((arg) => arg.startsWith(ASSET_BASE_URL_ARG_PREFIX));
const assetBaseUrl = assetBaseUrlArg ? assetBaseUrlArg.slice(ASSET_BASE_URL_ARG_PREFIX.length) : "";

// Retain numbers delivered before React mounts the transparent overlay.
let countdownValue: number | null = null;
const countdownListeners = new Set<(value: number | null) => void>();
ipcRenderer.on("countdown-overlay-value", (_event, value: number | null) => {
	countdownValue = value;
	for (const listener of countdownListeners) listener(value);
});

contextBridge.exposeInMainWorld("electronAPI", {
	onStudioMcpCommand: (
		callback: (command: import("../src/lib/studioMcpContract").StudioCommand) => Promise<unknown>,
	) => {
		const listener = async (
			_event: Electron.IpcRendererEvent,
			command: import("../src/lib/studioMcpContract").StudioCommand,
		) => {
			try {
				ipcRenderer.send("studio-mcp-response", {
					id: command.id,
					result: await callback(command),
				});
			} catch (error) {
				ipcRenderer.send("studio-mcp-response", {
					id: command.id,
					error: error instanceof Error ? error.message : "Studio command failed",
				});
			}
		};
		ipcRenderer.on("studio-mcp-command", listener);
		ipcRenderer.send("studio-mcp-ready");
		return () => ipcRenderer.removeListener("studio-mcp-command", listener);
	},
	writeStudioMcpExport: (data: ArrayBuffer, target: string) =>
		ipcRenderer.invoke("studio-mcp-write-export", data, target),
	onCliExportJob: (
		callback: (job: import("./cliExportRunner").CliExportJobMessage) => Promise<void>,
	) => {
		const listener = (
			_event: Electron.IpcRendererEvent,
			job: import("./cliExportRunner").CliExportJobMessage,
		) => {
			void callback(job);
		};
		ipcRenderer.on("cli-export-job", listener);
		ipcRenderer.send("cli-export-ready");
		return () => ipcRenderer.removeListener("cli-export-job", listener);
	},
	reportCliExportProgress: (id: string, percentage: number) =>
		ipcRenderer.send("cli-export-progress", { id, percentage }),
	reportCliExportResult: (result: import("./cliExportRunner").CliExportResultMessage) =>
		ipcRenderer.send("cli-export-result", result),
	reportCliExportLog: (id: string, message: string) =>
		ipcRenderer.send("cli-export-log", { id, message }),
	assetBaseUrl,
	invokeNativeBridge: <TData>(request: NativeBridgeRequest) => {
		return ipcRenderer.invoke(NATIVE_BRIDGE_CHANNEL, request) as Promise<TData>;
	},
	hudOverlayHide: () => {
		ipcRenderer.send("hud-overlay-hide");
	},
	hudOverlayClose: () => {
		ipcRenderer.send("hud-overlay-close");
	},
	setHudOverlayIgnoreMouseEvents: (ignore: boolean) => {
		ipcRenderer.send("hud-overlay-ignore-mouse-events", ignore);
	},
	moveHudOverlayBy: (deltaX: number, deltaY: number) => {
		ipcRenderer.send("hud-overlay-move-by", deltaX, deltaY);
	},
	setHudOverlaySize: (width: number, height: number) => {
		ipcRenderer.send("hud-overlay-set-size", width, height);
	},
	getSources: async (opts: Electron.SourcesOptions) => {
		return await ipcRenderer.invoke("get-sources", opts);
	},
	switchToEditor: () => {
		return ipcRenderer.invoke("switch-to-editor");
	},
	finishRecording: () => ipcRenderer.invoke("finish-recording"),
	getLiveBlurState: () => ipcRenderer.invoke("get-live-blur-state"),
	openBlurrySettings: () => ipcRenderer.invoke("open-blurry-settings"),
	getBlurrySelected: () => ipcRenderer.invoke("get-blurry-selected"),
	setBlurrySelected: (selected: boolean) => ipcRenderer.invoke("set-blurry-selected", selected),
	setLiveBlurAreas: (areas: import("../src/lib/liveBlur").LiveBlurArea[]) =>
		ipcRenderer.invoke("set-live-blur-areas", areas),
	setLiveBlurPaused: (paused: boolean) => ipcRenderer.invoke("set-live-blur-paused", paused),
	onLiveBlurStateChanged: (
		callback: (state: import("../src/lib/liveBlur").LiveBlurState) => void,
	) => {
		const listener = (
			_event: Electron.IpcRendererEvent,
			state: import("../src/lib/liveBlur").LiveBlurState,
		) => callback(state);
		ipcRenderer.on("live-blur-state-changed", listener);
		return () => ipcRenderer.removeListener("live-blur-state-changed", listener);
	},
	recordingVideoSaved: (filePath: string) => ipcRenderer.invoke("recording-video-saved", filePath),
	dismissRecordingVideo: () => ipcRenderer.invoke("dismiss-recording-video"),
	configureAfterRecording: () => ipcRenderer.invoke("configure-after-recording"),
	readAfterRecordingSettings: () => ipcRenderer.invoke("read-after-recording-settings"),
	getQuietRecordingSupport: () => ipcRenderer.invoke("get-quiet-recording-support"),
	prepareQuietRecording: () => ipcRenderer.invoke("prepare-quiet-recording"),
	releaseQuietRecording: () => ipcRenderer.invoke("release-quiet-recording"),
	saveAfterRecordingSettings: (settings: import("./afterRecording").AfterRecording) =>
		ipcRenderer.invoke("save-after-recording-settings", settings),
	chooseRecordingEditor: () => ipcRenderer.invoke("choose-recording-editor"),
	closeSettings: () => ipcRenderer.invoke("close-settings"),
	windowControl: (action: "minimize" | "toggle-maximize" | "close" | "state") =>
		ipcRenderer.invoke("window-control", action),
	getAppInfo: () => ipcRenderer.invoke("get-app-info"),
	checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
	onSettingsSectionChanged: (callback: (section: string) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, section: string) => callback(section);
		ipcRenderer.on("settings-select-section", listener);
		return () => ipcRenderer.removeListener("settings-select-section", listener);
	},
	openFullEditor: () => {
		return ipcRenderer.invoke("switch-to-editor");
	},
	switchToHud: () => {
		return ipcRenderer.invoke("switch-to-hud");
	},
	startNewRecording: () => {
		return ipcRenderer.invoke("start-new-recording");
	},
	openSourceSelector: () => {
		return ipcRenderer.invoke("open-source-selector");
	},
	selectSource: (source: ProcessedDesktopSource) => {
		return ipcRenderer.invoke("select-source", source);
	},
	getSelectedSource: () => {
		return ipcRenderer.invoke("get-selected-source");
	},
	getRecordingPreviewState: () => ipcRenderer.invoke("get-recording-preview-state"),
	startRecordingPreviewCapture: (id: string, sourceId: string) =>
		ipcRenderer.invoke("start-recording-preview-capture", id, sourceId),
	stopRecordingPreviewCapture: (id: string) =>
		ipcRenderer.invoke("stop-recording-preview-capture", id),
	onRecordingPreviewFrame: (
		callback: (frame: {
			captureId: string;
			imageDataUrl?: string;
			unavailable?: boolean;
			sourceWidth?: number;
			sourceHeight?: number;
		}) => void,
	) => {
		const listener = (
			_event: Electron.IpcRendererEvent,
			frame: {
				captureId: string;
				imageDataUrl?: string;
				unavailable?: boolean;
				sourceWidth?: number;
				sourceHeight?: number;
			},
		) => callback(frame);
		ipcRenderer.on("recording-preview-frame", listener);
		return () => ipcRenderer.removeListener("recording-preview-frame", listener);
	},
	getRecordingPreviewSettings: () => ipcRenderer.invoke("get-recording-preview-settings"),
	setRecordingPreviewSettings: (settings: RecordingPreviewSettings) =>
		ipcRenderer.send("set-recording-preview-settings", settings),
	chooseRecordingCursorMode: (mode: string, labels: string[]) =>
		ipcRenderer.invoke("choose-recording-cursor-mode", mode, labels),
	onRecordingPreviewSettingsChanged: (callback: (settings: RecordingPreviewSettings) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, settings: RecordingPreviewSettings) =>
			callback(settings);
		ipcRenderer.on("recording-preview-settings-changed", listener);
		return () => ipcRenderer.removeListener("recording-preview-settings-changed", listener);
	},
	sendWebcamPreviewSignal: (signal: WebcamPreviewSignal) =>
		ipcRenderer.send("webcam-preview-signal", signal),
	onWebcamPreviewSignal: (callback: (signal: WebcamPreviewSignal) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, signal: WebcamPreviewSignal) =>
			callback(signal);
		ipcRenderer.on("webcam-preview-signal", listener);
		return () => ipcRenderer.removeListener("webcam-preview-signal", listener);
	},
	onRecordingPreviewVisibilityChanged: (callback: (visible: boolean) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, visible: boolean) => callback(visible);
		ipcRenderer.on("recording-preview-visibility-changed", listener);
		return () => ipcRenderer.removeListener("recording-preview-visibility-changed", listener);
	},
	toggleRecordingPreview: () => ipcRenderer.invoke("toggle-recording-preview"),
	onRecordingPreviewChanged: (callback: (open: boolean) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, open: boolean) => callback(open);
		ipcRenderer.on("recording-preview-changed", listener);
		return () => ipcRenderer.removeListener("recording-preview-changed", listener);
	},
	onRecordingPreviewSourceChanged: (
		callback: (source: Pick<ProcessedDesktopSource, "id" | "name"> | null) => void,
	) => {
		const listener = (
			_event: Electron.IpcRendererEvent,
			source: Pick<ProcessedDesktopSource, "id" | "name"> | null,
		) => callback(source);
		ipcRenderer.on("recording-preview-source-changed", listener);
		return () => ipcRenderer.removeListener("recording-preview-source-changed", listener);
	},
	requestCameraAccess: () => {
		return ipcRenderer.invoke("request-camera-access");
	},
	getCameraControls: (deviceName: string) => {
		return ipcRenderer.invoke("get-camera-controls", deviceName);
	},
	setCameraControl: (request: import("../src/lib/cameraControls").SetCameraControlRequest) => {
		return ipcRenderer.invoke("set-camera-control", request);
	},
	requestScreenAccess: () => {
		return ipcRenderer.invoke("request-screen-access");
	},
	requestNativeMacCursorAccess: () => {
		return ipcRenderer.invoke("request-native-mac-cursor-access");
	},
	storeRecordedVideo: (videoData: ArrayBuffer, fileName: string) => {
		return ipcRenderer.invoke("store-recorded-video", videoData, fileName);
	},
	storeRecordedSession: (payload: StoreRecordedSessionInput) => {
		return ipcRenderer.invoke("store-recorded-session", payload);
	},
	openRecordingStream: (fileName: string) => {
		return ipcRenderer.invoke("open-recording-stream", fileName);
	},
	appendRecordingChunk: (fileName: string, chunk: ArrayBuffer) => {
		return ipcRenderer.invoke("append-recording-chunk", fileName, chunk);
	},
	closeRecordingStream: (fileName: string) => {
		return ipcRenderer.invoke("close-recording-stream", fileName);
	},

	getRecordedVideoPath: () => {
		return ipcRenderer.invoke("get-recorded-video-path");
	},
	setRecordingState: (
		recording: boolean,
		recordingId?: number,
		cursorCaptureMode?: import("../src/lib/recordingSession").CursorCaptureMode,
	) => {
		return ipcRenderer.invoke("set-recording-state", recording, recordingId, cursorCaptureMode);
	},
	isNativeWindowsCaptureAvailable: () => {
		return ipcRenderer.invoke("is-native-windows-capture-available");
	},
	isNativeMacCaptureAvailable: () => {
		return ipcRenderer.invoke("is-native-mac-capture-available");
	},
	startNativeWindowsRecording: (request: NativeWindowsRecordingRequest) => {
		return ipcRenderer.invoke("start-native-windows-recording", request);
	},
	stopNativeWindowsRecording: (discard?: boolean) => {
		return ipcRenderer.invoke("stop-native-windows-recording", discard);
	},
	pauseNativeWindowsRecording: () => {
		return ipcRenderer.invoke("pause-native-windows-recording");
	},
	resumeNativeWindowsRecording: () => {
		return ipcRenderer.invoke("resume-native-windows-recording");
	},
	startNativeMacRecording: (request: NativeMacRecordingRequest) => {
		return ipcRenderer.invoke("start-native-mac-recording", request);
	},
	pauseNativeMacRecording: () => {
		return ipcRenderer.invoke("pause-native-mac-recording");
	},
	resumeNativeMacRecording: () => {
		return ipcRenderer.invoke("resume-native-mac-recording");
	},
	stopNativeMacRecording: (discard?: boolean) => {
		return ipcRenderer.invoke("stop-native-mac-recording", discard);
	},
	attachNativeMacWebcamRecording: (payload: {
		screenVideoPath: string;
		recordingId: number;
		webcam: { fileName: string; videoData: ArrayBuffer };
		cursorCaptureMode?: import("../src/lib/recordingSession").CursorCaptureMode;
	}) => {
		return ipcRenderer.invoke("attach-native-mac-webcam-recording", payload);
	},
	getCursorTelemetry: (videoPath?: string) => {
		return ipcRenderer.invoke("get-cursor-telemetry", videoPath);
	},
	discardCursorTelemetry: (recordingId: number) => {
		return ipcRenderer.invoke("discard-cursor-telemetry", recordingId);
	},
	onStopRecordingFromTray: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("stop-recording-from-tray", listener);
		return () => ipcRenderer.removeListener("stop-recording-from-tray", listener);
	},
	onToggleRecordingShortcut: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("toggle-recording-from-shortcut", listener);
		return () => ipcRenderer.removeListener("toggle-recording-from-shortcut", listener);
	},
	onTogglePauseShortcut: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("toggle-pause-from-shortcut", listener);
		return () => ipcRenderer.removeListener("toggle-pause-from-shortcut", listener);
	},
	openExternalUrl: (url: string) => {
		return ipcRenderer.invoke("open-external-url", url);
	},
	pickExportSavePath: (fileName: string, exportFolder?: string) => {
		return ipcRenderer.invoke("pick-export-save-path", fileName, exportFolder);
	},
	writeExportToPath: (videoData: ArrayBuffer, filePath: string) => {
		return ipcRenderer.invoke("write-export-to-path", videoData, filePath);
	},
	copyFilePath: (filePath: string) => ipcRenderer.invoke("copy-file-path", filePath),
	exportOriginalRecording: (filePath: string) =>
		ipcRenderer.invoke("export-original-recording", filePath),
	openVideoFilePicker: () => {
		return ipcRenderer.invoke("open-video-file-picker");
	},
	setCurrentVideoPath: (path: string) => {
		return ipcRenderer.invoke("set-current-video-path", path);
	},
	setCurrentRecordingSession: (session: RecordingSession | null) => {
		return ipcRenderer.invoke("set-current-recording-session", session);
	},
	getCurrentVideoPath: () => {
		return ipcRenderer.invoke("get-current-video-path");
	},
	getCurrentRecordingSession: () => {
		return ipcRenderer.invoke("get-current-recording-session");
	},
	readBinaryFile: (filePath: string) => {
		return ipcRenderer.invoke("read-binary-file", filePath);
	},
	preparePreviewAudioTrack: (filePath: string) => {
		return ipcRenderer.invoke("prepare-preview-audio-track", filePath);
	},
	clearCurrentVideoPath: () => {
		return ipcRenderer.invoke("clear-current-video-path");
	},
	saveProjectFile: (projectData: unknown, suggestedName?: string, existingProjectPath?: string) => {
		return ipcRenderer.invoke("save-project-file", projectData, suggestedName, existingProjectPath);
	},
	loadProjectFile: (projectFolder?: string) => {
		return ipcRenderer.invoke("load-project-file", projectFolder);
	},
	loadProjectFileFromPath: (filePath: string) => {
		return ipcRenderer.invoke("load-project-file-from-path", filePath);
	},
	getPathForFile: (file: File) => {
		try {
			return webUtils.getPathForFile(file);
		} catch {
			return "";
		}
	},
	loadCurrentProjectFile: () => {
		return ipcRenderer.invoke("load-current-project-file");
	},
	onMenuNewProject: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu-new-project", listener);
		return () => ipcRenderer.removeListener("menu-new-project", listener);
	},
	onMenuImportVideo: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu-import-video", listener);
		return () => ipcRenderer.removeListener("menu-import-video", listener);
	},
	onMenuLoadProject: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu-load-project", listener);
		return () => ipcRenderer.removeListener("menu-load-project", listener);
	},
	onMenuSaveProject: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu-save-project", listener);
		return () => ipcRenderer.removeListener("menu-save-project", listener);
	},
	onMenuSaveProjectAs: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu-save-project-as", listener);
		return () => ipcRenderer.removeListener("menu-save-project-as", listener);
	},
	getPlatform: () => {
		return ipcRenderer.invoke("get-platform");
	},
	revealInFolder: (filePath: string) => {
		return ipcRenderer.invoke("reveal-in-folder", filePath);
	},
	getShortcuts: () => {
		return ipcRenderer.invoke("get-shortcuts");
	},
	saveShortcuts: (shortcuts: unknown) => {
		return ipcRenderer.invoke("save-shortcuts", shortcuts);
	},
	onShortcutsChanged: (callback: (config: unknown) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, config: unknown) => callback(config);
		ipcRenderer.on("shortcuts-changed", listener);
		return () => ipcRenderer.removeListener("shortcuts-changed", listener);
	},
	setLocale: (locale: string) => {
		return ipcRenderer.invoke("set-locale", locale);
	},
	saveDiagnostic: (payload: {
		error: string;
		stack?: string;
		projectState: unknown;
		logs: string[];
	}) => {
		return ipcRenderer.invoke("save-diagnostic", payload);
	},
	setMicrophoneExpanded: (expanded: boolean) => {
		ipcRenderer.send("hud:setMicrophoneExpanded", expanded);
	},
	setHasUnsavedChanges: (hasChanges: boolean) => {
		ipcRenderer.send("set-has-unsaved-changes", hasChanges);
	},
	showCountdownOverlay: (value: number, runId: number) => {
		return ipcRenderer.invoke("countdown-overlay-show", value, runId);
	},
	setCountdownOverlayValue: (value: number, runId: number) => {
		return ipcRenderer.invoke("countdown-overlay-set-value", value, runId);
	},
	hideCountdownOverlay: (runId: number) => {
		return ipcRenderer.invoke("countdown-overlay-hide", runId);
	},
	onCountdownOverlayValue: (callback: (value: number | null) => void) => {
		countdownListeners.add(callback);
		callback(countdownValue);
		return () => {
			countdownListeners.delete(callback);
		};
	},
	onRequestSaveBeforeClose: (callback: () => Promise<boolean> | boolean) => {
		const listener = async () => {
			try {
				const shouldClose = await callback();
				ipcRenderer.send("save-before-close-done", shouldClose);
			} catch {
				ipcRenderer.send("save-before-close-done", false);
			}
		};
		ipcRenderer.on("request-save-before-close", listener);
		return () => ipcRenderer.removeListener("request-save-before-close", listener);
	},
	onRequestCloseConfirm: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("request-close-confirm", listener);
		return () => ipcRenderer.removeListener("request-close-confirm", listener);
	},
	sendCloseConfirmResponse: (choice: "save" | "discard" | "cancel") => {
		ipcRenderer.send("close-confirm-response", choice);
	},
});
