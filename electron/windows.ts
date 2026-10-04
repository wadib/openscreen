import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BrowserWindow, ipcMain, Menu, screen } from "electron";
import type { RecordingPreviewSettings, WebcamPreviewSignal } from "../src/lib/recordingPreview";
import { normalizeCursorCaptureMode } from "../src/lib/recordingSession";
import { protectRecordingPreview } from "./recording/preview-protection";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST = path.join(APP_ROOT, "dist");
const HEADLESS = process.env["HEADLESS"] === "true";

// Asset base URL for renderer (wallpapers, etc.). Packaged: extraResources copies
// public/wallpapers to resources/wallpapers. Unpackaged: <appRoot>/public/.
const ASSET_BASE_DIR = process.defaultApp
	? path.join(__dirname, "..", "public")
	: process.resourcesPath;
const ASSET_BASE_URL_ARG = `--asset-base-url=${pathToFileURL(`${ASSET_BASE_DIR}${path.sep}`).toString()}`;

let hudOverlayWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
export function isRecorderWindow(requesterId: number): boolean {
	return Boolean(
		hudOverlayWindow &&
			!hudOverlayWindow.isDestroyed() &&
			hudOverlayWindow.webContents.id === requesterId,
	);
}

export function isSettingsWindow(requesterId: number): boolean {
	return Boolean(
		settingsWindow &&
			!settingsWindow.isDestroyed() &&
			settingsWindow.webContents.id === requesterId,
	);
}

export function closeSettingsWindow() {
	settingsWindow?.close();
}

export function createSettingsWindow(): BrowserWindow {
	if (settingsWindow && !settingsWindow.isDestroyed()) {
		settingsWindow.show();
		settingsWindow.focus();
		return settingsWindow;
	}
	const win = new BrowserWindow({
		width: 420,
		height: 440,
		useContentSize: true,
		title: "Settings",
		parent: hudOverlayWindow ?? undefined,
		modal: true,
		backgroundColor: "#09090b",
		resizable: false,
		minimizable: false,
		maximizable: false,
		alwaysOnTop: true,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
		},
	});
	win.setMenu(null);
	settingsWindow = win;
	win.center();
	win.once("ready-to-show", () => {
		if (!HEADLESS) win.show();
	});
	win.on("closed", () => {
		if (settingsWindow === win) settingsWindow = null;
	});
	if (VITE_DEV_SERVER_URL) {
		void win.loadURL(`${VITE_DEV_SERVER_URL}?windowType=settings`);
	} else {
		void win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "settings" },
		});
	}
	return win;
}

let recordingPreviewWindow: BrowserWindow | null = null;
let recordingPreviewSettings: RecordingPreviewSettings = {
	cursorCaptureMode: "editable-overlay",
	webcamEnabled: false,
};

export function getRecordingPreviewConfiguration(requesterId: number) {
	return recordingPreviewWindow &&
		!recordingPreviewWindow.isDestroyed() &&
		recordingPreviewWindow.webContents.id === requesterId
		? recordingPreviewSettings
		: null;
}

ipcMain.handle("get-recording-preview-settings", () => recordingPreviewSettings);
ipcMain.on("set-recording-preview-settings", (event, settings: RecordingPreviewSettings) => {
	if (event.sender !== hudOverlayWindow?.webContents) return;
	const mode = normalizeCursorCaptureMode(settings?.cursorCaptureMode);
	if (!mode || typeof settings.webcamEnabled !== "boolean") return;
	recordingPreviewSettings = {
		cursorCaptureMode: mode,
		webcamEnabled: settings.webcamEnabled,
		webcamStreamId:
			typeof settings.webcamStreamId === "string"
				? settings.webcamStreamId.slice(0, 80)
				: undefined,
	};
	recordingPreviewWindow?.webContents.send(
		"recording-preview-settings-changed",
		recordingPreviewSettings,
	);
});
ipcMain.on("webcam-preview-signal", (event, signal: WebcamPreviewSignal) => {
	const fromHud = event.sender === hudOverlayWindow?.webContents;
	const fromViewer = event.sender === recordingPreviewWindow?.webContents;
	if (!fromHud && !fromViewer) return;
	if (!signal || typeof signal.id !== "string" || signal.id.length > 80) return;
	if (signal.type !== "close" && (typeof signal.sdp !== "string" || signal.sdp.length > 65_536))
		return;
	if (
		fromHud ? !["answer", "close"].includes(signal.type) : !["offer", "close"].includes(signal.type)
	)
		return;
	const target = fromHud ? recordingPreviewWindow : hudOverlayWindow;
	if (target && !target.isDestroyed()) target.webContents.send("webcam-preview-signal", signal);
});
ipcMain.handle("choose-recording-cursor-mode", (event, current: unknown, labels: string[]) => {
	if (event.sender !== hudOverlayWindow?.webContents || !hudOverlayWindow) return null;
	if (
		!Array.isArray(labels) ||
		labels.length !== 2 ||
		labels.some((label) => typeof label !== "string" || label.length > 120)
	)
		return null;
	return new Promise((resolve) => {
		const menu = Menu.buildFromTemplate(
			["editable-overlay", "system"].map((mode, index) => ({
				label: labels[index],
				type: "radio" as const,
				checked: current === mode,
				click: () => resolve(mode),
			})),
		);
		menu.popup({ window: hudOverlayWindow!, callback: () => resolve(null) });
	});
});

export function isRecordingPreviewSupported(): boolean {
	const [major, , build] = os.release().split(".").map(Number);
	return process.platform === "win32" && (major > 10 || (major === 10 && build >= 19041));
}

export function isRecordingPreviewOpen(): boolean {
	return Boolean(recordingPreviewWindow && !recordingPreviewWindow.isDestroyed());
}

export function isRecordingPreviewVisible(): boolean {
	return isRecordingPreviewOpen() && !recordingPreviewWindow!.isMinimized();
}

export function isRecordingPreviewSource(sourceId: string): boolean {
	if (!recordingPreviewWindow || recordingPreviewWindow.isDestroyed()) return false;
	const handle = recordingPreviewWindow.getNativeWindowHandle();
	const id =
		handle.length === 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE());
	return sourceId.startsWith(`window:${id}:`);
}

function notifyRecordingPreviewChanged(open: boolean) {
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		hudOverlayWindow.webContents.send("recording-preview-changed", open);
	}
}

export function updateRecordingPreviewSource(source: { id?: string; name: string } | null) {
	if (recordingPreviewWindow && !recordingPreviewWindow.isDestroyed()) {
		recordingPreviewWindow.webContents.send(
			"recording-preview-source-changed",
			source?.id ? { id: source.id, name: source.name } : null,
		);
	}
}

export function closeRecordingPreviewWindow() {
	if (recordingPreviewWindow && !recordingPreviewWindow.isDestroyed()) {
		recordingPreviewWindow.close();
	}
}

export async function createRecordingPreviewWindow(): Promise<BrowserWindow> {
	if (!isRecordingPreviewSupported()) throw new Error("Recording preview is not supported");
	if (recordingPreviewWindow && !recordingPreviewWindow.isDestroyed()) {
		return recordingPreviewWindow;
	}

	const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
	const width = Math.min(480, workArea.width);
	const height = Math.min(340, workArea.height);
	const win = new BrowserWindow({
		width,
		height,
		minWidth: 280,
		minHeight: 220,
		x: Math.max(workArea.x, workArea.x + workArea.width - width - 16),
		y: Math.min(workArea.y + 16, workArea.y + workArea.height - height),
		title: "Recording preview",
		backgroundColor: "#09090b",
		resizable: true,
		maximizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
		},
	});
	// Electron initializes display affinity only after first show; stay invisible until protected.
	win.setOpacity(0);
	win.setIgnoreMouseEvents(true);
	win.showInactive();
	win.setMenu(null);
	recordingPreviewWindow = win;
	win.on("minimize", () => win.webContents.send("recording-preview-visibility-changed", false));
	win.on("restore", () => win.webContents.send("recording-preview-visibility-changed", true));
	win.once("ready-to-show", () => {
		if (!HEADLESS) {
			win.setOpacity(1);
			win.setIgnoreMouseEvents(false);
			win.showInactive();
		}
	});
	win.on("closed", () => {
		if (recordingPreviewWindow === win) {
			recordingPreviewWindow = null;
			hudOverlayWindow?.webContents.send("webcam-preview-signal", { id: "", type: "close" });
			notifyRecordingPreviewChanged(false);
		}
	});
	try {
		await protectRecordingPreview(win);
	} catch (error) {
		if (!win.isDestroyed()) win.destroy();
		throw error;
	}
	if (VITE_DEV_SERVER_URL) {
		void win.loadURL(`${VITE_DEV_SERVER_URL}?windowType=recording-preview`);
	} else {
		void win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "recording-preview" },
		});
	}
	notifyRecordingPreviewChanged(true);
	return win;
}

ipcMain.on("hud-overlay-hide", () => {
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		hudOverlayWindow.minimize();
	}
});

ipcMain.on("hud-overlay-ignore-mouse-events", (_event, ignore: boolean) => {
	if (hudOverlayWindow && !hudOverlayWindow.isDestroyed()) {
		hudOverlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
	}
});

ipcMain.on("hud-overlay-move-by", (_event, deltaX: number, deltaY: number) => {
	if (
		!hudOverlayWindow ||
		hudOverlayWindow.isDestroyed() ||
		!Number.isFinite(deltaX) ||
		!Number.isFinite(deltaY)
	) {
		return;
	}

	const [x, y] = hudOverlayWindow.getPosition();
	hudOverlayWindow.setPosition(Math.round(x + deltaX), Math.round(y + deltaY), false);
});

// Resize the HUD to fit its rendered content. Anchored by its bottom-centre so it
// stays where the user dragged it while only growing/shrinking, which lets the
// vertical tray layout grow tall instead of scrolling inside a fixed window.
ipcMain.on("hud-overlay-set-size", (_event, width: number, height: number) => {
	if (
		!hudOverlayWindow ||
		hudOverlayWindow.isDestroyed() ||
		!Number.isFinite(width) ||
		!Number.isFinite(height)
	) {
		return;
	}

	const bounds = hudOverlayWindow.getBounds();

	// Clamp to the work area of the display the HUD sits on; on a short screen the
	// vertical layout can exceed the display, where the bar's own overflow scroll takes over.
	const { workArea } = screen.getDisplayMatching(bounds);
	const nextWidth = Math.min(workArea.width, Math.max(1, Math.round(width)));
	const nextHeight = Math.min(workArea.height, Math.max(1, Math.round(height)));

	if (bounds.width === nextWidth && bounds.height === nextHeight) {
		return;
	}

	const centerX = bounds.x + bounds.width / 2;
	const bottomY = bounds.y + bounds.height;

	hudOverlayWindow.setBounds({
		x: Math.round(centerX - nextWidth / 2),
		y: Math.round(bottomY - nextHeight),
		width: nextWidth,
		height: nextHeight,
	});
});

/**
 * Frameless transparent HUD overlay, always-on-top, centred at the bottom of the
 * primary display. Follows the user across macOS Spaces so it isn't lost on switch.
 */
export function createHudOverlayWindow(showInitially = true): BrowserWindow {
	const primaryDisplay = screen.getPrimaryDisplay();
	const { workArea } = primaryDisplay;

	const windowWidth = 600;
	const windowHeight = 160;

	const x = Math.floor(workArea.x + (workArea.width - windowWidth) / 2);
	const y = Math.floor(workArea.y + workArea.height - windowHeight - 5);

	const win = new BrowserWindow({
		width: windowWidth,
		height: windowHeight,
		// Min/max are intentionally loose: the renderer resizes to fit content via
		// "hud-overlay-set-size" (above), needed for the vertical tray to grow taller.
		minWidth: 120,
		minHeight: 80,
		x: x,
		y: y,
		frame: false,
		transparent: true,
		// Fully-transparent ARGB backing. Without this macOS draws the window as a
		// rounded glass panel with a border around the HUD content.
		backgroundColor: "#00000000",
		// Don't let macOS mask the window into a rounded rect; the HUD bar provides
		// its own rounding and the window itself must be invisible.
		roundedCorners: false,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		show: false, // shown via ready-to-show to avoid black rectangle flash
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});
	win.setIgnoreMouseEvents(true, { forward: true });
	// Recover z-order without activation, while respecting explicit hiding and popups.
	const keepOnTop = () => {
		if (win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
		const hasPopup = BrowserWindow.getAllWindows().some((candidate) => {
			if (candidate === win || candidate.isDestroyed() || !candidate.isVisible()) return false;
			try {
				return ["settings", "source-selector", "countdown-overlay"].includes(
					new URL(candidate.webContents.getURL()).searchParams.get("windowType") ?? "",
				);
			} catch {
				return false;
			}
		});
		if (hasPopup) return;
		win.setAlwaysOnTop(true, "screen-saver");
		win.moveTop();
	};
	win.setAlwaysOnTop(true, "screen-saver");
	win.on("show", keepOnTop);
	win.on("restore", keepOnTop);
	const topmostTimer = setInterval(keepOnTop, 1000);
	topmostTimer.unref();
	win.once("closed", () => clearInterval(topmostTimer));

	// Follow the user across macOS Spaces, else the HUD stays pinned to the Space
	// it was first opened on.
	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	// Show only once painted to avoid the black rectangle flash when a transparent
	// window is shown before its first paint.
	win.once("ready-to-show", () => {
		if (!HEADLESS && showInitially) win.show();
	});

	win.webContents.on("did-finish-load", () => {
		if (win.isDestroyed() || win.webContents.isDestroyed()) return;
		win.webContents.send("main-process-message", new Date().toLocaleString());
	});

	hudOverlayWindow = win;

	win.on("closed", () => {
		if (hudOverlayWindow === win) {
			hudOverlayWindow = null;
		}
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=hud-overlay");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "hud-overlay" },
		});
	}

	return win;
}

/**
 * Main editor window. Starts maximised with a hidden title bar on macOS; not
 * always-on-top and appears in the taskbar/dock.
 */
export function createEditorWindow(exportOnly = false, showInitially = true): BrowserWindow {
	const isMac = process.platform === "darwin";

	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		...(isMac && {
			titleBarStyle: "hiddenInset",
			trafficLightPosition: { x: 12, y: 12 },
		}),
		transparent: false,
		resizable: true,
		alwaysOnTop: false,
		skipTaskbar: false,
		title: "OpenScreen",
		backgroundColor: "#09090b",
		show: false, // shown via ready-to-show to avoid white flash on first load
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: false,
			backgroundThrottling: false,
		},
	});

	if (!exportOnly) win.once("show", () => win.maximize());
	else win.setSize(900, 700);

	// Show only once painted to avoid a white flash on cold Vite start. On Windows,
	// briefly enter the topmost band so a recording target cannot leave Studio
	// visible-but-buried when the user chose not to hide after recording.
	win.once("ready-to-show", () => {
		if (HEADLESS || !showInitially) return;
		if (process.platform === "win32") win.setAlwaysOnTop(true, "screen-saver");
		win.show();
		win.focus();
		win.moveTop();
		if (process.platform === "win32") {
			setTimeout(() => {
				if (win.isDestroyed() || !win.isVisible()) return;
				win.setAlwaysOnTop(false);
				win.focus();
				win.moveTop();
			}, 250).unref();
		}
	});

	// Inject dark background before any React paint so the sub-titlebar area never
	// flashes white on a cold Vite load.
	win.webContents.on("dom-ready", () => {
		if (win.isDestroyed() || win.webContents.isDestroyed()) return;
		win.webContents.insertCSS("html, body, #root { background: #09090b !important; }").catch(() => {
			// Best-effort cosmetic; ignore if the page is mid-teardown.
		});
	});

	win.webContents.on("did-finish-load", () => {
		if (win.isDestroyed() || win.webContents.isDestroyed()) return;
		win.webContents.send("main-process-message", new Date().toLocaleString());
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=editor" + (exportOnly ? "&exportOnly=1" : ""));
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "editor", ...(exportOnly ? { exportOnly: "1" } : {}) },
		});
	}

	return win;
}

/**
 * Floating source-selector window for picking a screen or window to record.
 * Frameless, transparent, and follows the user across macOS Spaces.
 */
export function createSourceSelectorWindow(): BrowserWindow {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	const win = new BrowserWindow({
		width: 620,
		height: 420,
		minHeight: 350,
		maxHeight: 500,
		x: Math.round((width - 620) / 2),
		y: Math.round((height - 420) / 2),
		frame: false,
		resizable: false,
		alwaysOnTop: true,
		transparent: true,
		backgroundColor: "#00000000",
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	// Follow the user across macOS Spaces so the selector appears on the active
	// desktop regardless of where the HUD was opened.
	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=source-selector");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "source-selector" },
		});
	}

	return win;
}

/**
 * Centered transparent countdown overlay that sits above the HUD during
 * recording pre-roll.
 */
export function createCountdownOverlayWindow(): BrowserWindow {
	const { workArea } = screen.getPrimaryDisplay();
	const overlayWidth = 420;
	const overlayHeight = 260;

	const win = new BrowserWindow({
		width: overlayWidth,
		height: overlayHeight,
		minWidth: overlayWidth,
		maxWidth: overlayWidth,
		minHeight: overlayHeight,
		maxHeight: overlayHeight,
		x: Math.round(workArea.x + (workArea.width - overlayWidth) / 2),
		y: Math.round(workArea.y + (workArea.height - overlayHeight) / 2),
		frame: false,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		focusable: false,
		transparent: true,
		backgroundColor: "#00000000",
		hasShadow: false,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			additionalArguments: [ASSET_BASE_URL_ARG],
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});

	win.setIgnoreMouseEvents(true);

	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=countdown-overlay");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "countdown-overlay" },
		});
	}

	return win;
}
