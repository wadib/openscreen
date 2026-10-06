/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
	interface ProcessEnv {
		/**
		 * The built directory structure
		 *
		 * ```tree
		 * ├─┬─┬ dist
		 * │ │ └── index.html
		 * │ │
		 * │ ├─┬ dist-electron
		 * │ │ ├── main.js
		 * │ │ └── preload.js
		 * │
		 * ```
		 */
		APP_ROOT: string;
		/** /dist/ or /public/ */
		VITE_PUBLIC: string;
	}
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
	electronAPI: {
		onStudioMcpCommand: (
			callback: (command: import("../src/lib/studioMcpContract").StudioCommand) => Promise<unknown>,
		) => () => void;
		writeStudioMcpExport: (
			data: ArrayBuffer,
			target: string,
		) => Promise<{ success: boolean; path?: string; message?: string }>;
		invokeNativeBridge: <TData = unknown>(
			request: import("../src/native/contracts").NativeBridgeRequest,
		) => Promise<import("../src/native/contracts").NativeBridgeResponse<TData>>;
		getSources: (opts: Electron.SourcesOptions) => Promise<ProcessedDesktopSource[]>;
		switchToEditor: () => Promise<void>;
		finishRecording: () => Promise<void>;
		getLiveBlurState: () => Promise<import("../src/lib/liveBlur").LiveBlurState>;
		openBlurrySettings: () => Promise<void>;
		getBlurrySelected: () => Promise<boolean>;
		setBlurrySelected: (selected: boolean) => Promise<boolean>;
		setLiveBlurAreas: (
			areas: import("../src/lib/liveBlur").LiveBlurArea[],
		) => Promise<import("../src/lib/liveBlur").LiveBlurState>;
		setLiveBlurPaused: (paused: boolean) => Promise<void>;
		onLiveBlurStateChanged: (
			callback: (state: import("../src/lib/liveBlur").LiveBlurState) => void,
		) => () => void;
		configureAfterRecording: () => Promise<void>;
		readAfterRecordingSettings: () => Promise<import("./afterRecording").AfterRecording>;
		getQuietRecordingSupport: () => Promise<import("./recording/quiet-recording").QuietSupport>;
		prepareQuietRecording: () => Promise<void>;
		releaseQuietRecording: () => Promise<void>;
		saveAfterRecordingSettings: (
			settings: import("./afterRecording").AfterRecording,
		) => Promise<import("./afterRecording").AfterRecording>;
		chooseRecordingEditor: () => Promise<string | null>;
		closeSettings: () => Promise<void>;
		recordingVideoSaved: (filePath: string) => Promise<void>;
		dismissRecordingVideo: () => Promise<{ success: boolean }>;
		openFullEditor: () => Promise<void>;
		switchToHud: () => Promise<void>;
		startNewRecording: () => Promise<{ success: boolean; error?: string }>;
		openSourceSelector: () => Promise<{
			opened: boolean;
			reason?: string;
			access?: {
				success: boolean;
				granted: boolean;
				status: string;
				error?: string;
			};
		}>;
		selectSource: (source: ProcessedDesktopSource) => Promise<ProcessedDesktopSource | null>;
		getSelectedSource: () => Promise<ProcessedDesktopSource | null>;
		startRecordingPreviewCapture: (id: string, sourceId: string) => Promise<{ success: boolean }>;
		stopRecordingPreviewCapture: (id: string) => Promise<void>;
		onRecordingPreviewFrame: (
			callback: (frame: {
				captureId: string;
				imageDataUrl?: string;
				sourceWidth?: number;
				sourceHeight?: number;
				unavailable?: boolean;
			}) => void,
		) => () => void;
		getRecordingPreviewSettings: () => Promise<
			import("../src/lib/recordingPreview").RecordingPreviewSettings
		>;
		setRecordingPreviewSettings: (
			settings: import("../src/lib/recordingPreview").RecordingPreviewSettings,
		) => void;
		chooseRecordingCursorMode: (
			mode: string,
			labels: string[],
		) => Promise<"editable-overlay" | "system" | null>;
		onRecordingPreviewSettingsChanged: (
			callback: (settings: import("../src/lib/recordingPreview").RecordingPreviewSettings) => void,
		) => () => void;
		sendWebcamPreviewSignal: (
			signal: import("../src/lib/recordingPreview").WebcamPreviewSignal,
		) => void;
		onWebcamPreviewSignal: (
			callback: (signal: import("../src/lib/recordingPreview").WebcamPreviewSignal) => void,
		) => () => void;
		getRecordingPreviewState: () => Promise<{
			supported: boolean;
			open: boolean;
			visible: boolean;
		}>;
		onRecordingPreviewVisibilityChanged: (callback: (visible: boolean) => void) => () => void;
		toggleRecordingPreview: () => Promise<{ success: boolean; open: boolean }>;
		onRecordingPreviewChanged: (callback: (open: boolean) => void) => () => void;
		onRecordingPreviewSourceChanged: (
			callback: (source: Pick<ProcessedDesktopSource, "id" | "name"> | null) => void,
		) => () => void;
		requestCameraAccess: () => Promise<{
			success: boolean;
			granted: boolean;
			status: string;
			error?: string;
		}>;
		requestScreenAccess: () => Promise<{
			success: boolean;
			granted: boolean;
			status: string;
			error?: string;
		}>;
		requestNativeMacCursorAccess: () => Promise<{
			success: boolean;
			granted: boolean;
			status: string;
			error?: string;
		}>;
		assetBaseUrl: string;
		storeRecordedVideo: (
			videoData: ArrayBuffer,
			fileName: string,
		) => Promise<{
			success: boolean;
			path?: string;
			session?: import("../src/lib/recordingSession").RecordingSession;
			message?: string;
			error?: string;
		}>;
		storeRecordedSession: (
			payload: import("../src/lib/recordingSession").StoreRecordedSessionInput,
		) => Promise<{
			success: boolean;
			path?: string;
			session?: import("../src/lib/recordingSession").RecordingSession;
			message?: string;
			error?: string;
		}>;
		openRecordingStream: (fileName: string) => Promise<{ success: boolean; error?: string }>;
		appendRecordingChunk: (
			fileName: string,
			chunk: ArrayBuffer,
		) => Promise<{ success: boolean; error?: string }>;
		closeRecordingStream: (fileName: string) => Promise<{ success: boolean; error?: string }>;
		getRecordedVideoPath: () => Promise<{
			success: boolean;
			path?: string;
			message?: string;
			error?: string;
		}>;
		setRecordingState: (
			recording: boolean,
			recordingId?: number,
			cursorCaptureMode?: import("../src/lib/recordingSession").CursorCaptureMode,
		) => Promise<void>;
		getCameraControls: (
			deviceName: string,
		) => Promise<import("../src/lib/cameraControls").CameraControlsResult>;
		setCameraControl: (
			request: import("../src/lib/cameraControls").SetCameraControlRequest,
		) => Promise<import("../src/lib/cameraControls").CameraControlsResult>;
		isNativeWindowsCaptureAvailable: () => Promise<{
			success: boolean;
			available: boolean;
			helperPath?: string;
			reason?: string;
			error?: string;
		}>;
		isNativeMacCaptureAvailable: () => Promise<{
			success: boolean;
			available: boolean;
			helperPath?: string;
			reason?: "unsupported-platform" | "missing-helper" | string;
			error?: string;
		}>;
		startNativeWindowsRecording: (
			request: import("../src/lib/nativeWindowsRecording").NativeWindowsRecordingRequest,
		) => Promise<import("../src/lib/nativeWindowsRecording").NativeWindowsRecordingStartResult>;
		stopNativeWindowsRecording: (discard?: boolean) => Promise<{
			success: boolean;
			logPath?: string;
			stopped?: boolean;
			path?: string;
			session?: import("../src/lib/recordingSession").RecordingSession;
			message?: string;
			discarded?: boolean;
			error?: string;
		}>;
		pauseNativeWindowsRecording: () => Promise<{
			success: boolean;
			error?: string;
		}>;
		resumeNativeWindowsRecording: () => Promise<{
			success: boolean;
			error?: string;
		}>;
		startNativeMacRecording: (
			request: import("../src/lib/nativeMacRecording").NativeMacRecordingRequest,
		) => Promise<import("../src/lib/nativeMacRecording").NativeMacRecordingStartResult>;
		pauseNativeMacRecording: () => Promise<{
			success: boolean;
			error?: string;
		}>;
		resumeNativeMacRecording: () => Promise<{
			success: boolean;
			error?: string;
		}>;
		stopNativeMacRecording: (discard?: boolean) => Promise<{
			success: boolean;
			path?: string;
			session?: import("../src/lib/recordingSession").RecordingSession;
			message?: string;
			discarded?: boolean;
			error?: string;
		}>;
		attachNativeMacWebcamRecording: (payload: {
			screenVideoPath: string;
			recordingId: number;
			webcam: import("../src/lib/recordingSession").RecordedVideoAssetInput;
			cursorCaptureMode?: import("../src/lib/recordingSession").CursorCaptureMode;
		}) => Promise<{
			success: boolean;
			path?: string;
			session?: import("../src/lib/recordingSession").RecordingSession;
			message?: string;
			error?: string;
		}>;
		discardCursorTelemetry: (recordingId: number) => Promise<void>;
		getCursorTelemetry: (videoPath?: string) => Promise<{
			success: boolean;
			samples: CursorTelemetryPoint[];
			clicks: number[];
			message?: string;
			error?: string;
		}>;
		onStopRecordingFromTray: (callback: () => void) => () => void;
		onToggleRecordingShortcut: (callback: () => void) => () => void;
		onTogglePauseShortcut: (callback: () => void) => () => void;
		openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
		pickExportSavePath: (
			fileName: string,
			exportFolder?: string,
		) => Promise<{
			success: boolean;
			path?: string;
			message?: string;
			canceled?: boolean;
			error?: string;
		}>;
		writeExportToPath: (
			videoData: ArrayBuffer,
			filePath: string,
		) => Promise<{
			success: boolean;
			path?: string;
			message?: string;
			error?: string;
		}>;
		copyFilePath: (filePath: string) => Promise<void>;
		exportOriginalRecording: (filePath: string) => Promise<{
			success: boolean;
			path?: string;
			message?: string;
		}>;
		openVideoFilePicker: () => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
		setCurrentVideoPath: (path: string) => Promise<{ success: boolean }>;
		setCurrentRecordingSession: (
			session: import("../src/lib/recordingSession").RecordingSession | null,
		) => Promise<{
			success: boolean;
			session?: import("../src/lib/recordingSession").RecordingSession;
		}>;
		getCurrentVideoPath: () => Promise<{ success: boolean; path?: string }>;
		getCurrentRecordingSession: () => Promise<{
			success: boolean;
			session?: import("../src/lib/recordingSession").RecordingSession;
		}>;
		readBinaryFile: (filePath: string) => Promise<{
			success: boolean;
			data?: ArrayBuffer;
			path?: string;
			message?: string;
			error?: string;
		}>;
		preparePreviewAudioTrack: (filePath: string) => Promise<{
			success: boolean;
			path?: string | null;
			message?: string;
			error?: string;
		}>;
		clearCurrentVideoPath: () => Promise<{ success: boolean }>;
		saveProjectFile: (
			projectData: unknown,
			suggestedName?: string,
			existingProjectPath?: string,
		) => Promise<{
			success: boolean;
			path?: string;
			message?: string;
			canceled?: boolean;
			error?: string;
		}>;
		loadProjectFile: (projectFolder?: string) => Promise<{
			success: boolean;
			path?: string;
			project?: unknown;
			message?: string;
			canceled?: boolean;
			error?: string;
		}>;
		loadCurrentProjectFile: () => Promise<{
			success: boolean;
			path?: string;
			project?: unknown;
			message?: string;
			canceled?: boolean;
			error?: string;
		}>;
		getPathForFile: (file: File) => string;
		loadProjectFileFromPath: (filePath: string) => Promise<{
			success: boolean;
			path?: string;
			project?: unknown;
			message?: string;
			canceled?: boolean;
			error?: string;
		}>;
		onMenuNewProject: (callback: () => void) => () => void;
		onMenuImportVideo: (callback: () => void) => () => void;
		onMenuLoadProject: (callback: () => void) => () => void;
		onMenuSaveProject: (callback: () => void) => () => void;
		onMenuSaveProjectAs: (callback: () => void) => () => void;
		getPlatform: () => Promise<string>;
		revealInFolder: (
			filePath: string,
		) => Promise<{ success: boolean; error?: string; message?: string }>;
		getShortcuts: () => Promise<Record<string, unknown> | null>;
		saveShortcuts: (shortcuts: unknown) => Promise<{ success: boolean; error?: string }>;
		onShortcutsChanged: (callback: (config: unknown) => void) => () => void;
		hudOverlayHide: () => void;
		hudOverlayClose: () => void;
		setHudOverlayIgnoreMouseEvents: (ignore: boolean) => void;
		moveHudOverlayBy: (deltaX: number, deltaY: number) => void;
		setHudOverlaySize: (width: number, height: number) => void;
		showCountdownOverlay: (value: number, runId: number) => Promise<void>;
		setCountdownOverlayValue: (value: number, runId: number) => Promise<void>;
		hideCountdownOverlay: (runId: number) => Promise<void>;
		onCountdownOverlayValue: (callback: (value: number | null) => void) => () => void;
		setMicrophoneExpanded: (expanded: boolean) => void;
		setHasUnsavedChanges: (hasChanges: boolean) => void;
		onRequestSaveBeforeClose: (callback: () => Promise<boolean> | boolean) => () => void;
		onRequestCloseConfirm: (callback: () => void) => () => void;
		sendCloseConfirmResponse: (choice: "save" | "discard" | "cancel") => void;
		setLocale: (locale: string) => Promise<void>;
		saveDiagnostic: (payload: {
			error: string;
			stack?: string;
			projectState: unknown;
			logs: string[];
		}) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
	};
}

interface ProcessedDesktopSource {
	id: string;
	name: string;
	display_id: string;
	thumbnail: string | null;
	appIcon: string | null;
}

interface CursorTelemetryPoint {
	timeMs: number;
	cx: number;
	cy: number;
}
