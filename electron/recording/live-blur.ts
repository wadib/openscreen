import { BrowserWindow, ipcMain } from "electron";
import { LiveBlurRecorder } from "../../src/lib/liveBlur";
import { getRecordingPreviewConfiguration, isRecorderWindow } from "../windows";
import { getBlurrySelected, openBlurrySettings, setBlurrySelected } from "./blurry-settings";

export const liveBlurRecorder = new LiveBlurRecorder();
const state = () => liveBlurRecorder.state;

export function notifyLiveBlurState() {
	for (const win of BrowserWindow.getAllWindows()) {
		if (
			!win.isDestroyed() &&
			(isRecorderWindow(win.webContents.id) || getRecordingPreviewConfiguration(win.webContents.id))
		)
			win.webContents.send("live-blur-state-changed", state());
	}
}

export function registerLiveBlurHandlers(getSourceId: () => string | undefined) {
	const checkOwner = (id: number) => {
		if (!isRecorderWindow(id) && !getRecordingPreviewConfiguration(id))
			throw new Error("Recorder or viewer window required");
	};
	ipcMain.handle("get-live-blur-state", (event) => {
		checkOwner(event.sender.id);
		liveBlurRecorder.selectSource(getSourceId());
		return state();
	});
	ipcMain.handle("set-live-blur-areas", (event, candidate: unknown) => {
		checkOwner(event.sender.id);
		if (!Array.isArray(candidate) || candidate.length > 16)
			throw new Error("At most 16 live blur areas are supported");
		liveBlurRecorder.selectSource(getSourceId());
		liveBlurRecorder.update(candidate);
		notifyLiveBlurState();
		return state();
	});
	ipcMain.handle("set-live-blur-paused", (event, paused: unknown) => {
		if (!isRecorderWindow(event.sender.id) || typeof paused !== "boolean")
			throw new Error("Recorder window required");
		if (paused) liveBlurRecorder.pause();
		else liveBlurRecorder.resume();
		notifyLiveBlurState();
	});
	ipcMain.handle("open-blurry-settings", (event) => {
		if (!isRecorderWindow(event.sender.id)) throw new Error("Recorder window required");
		return openBlurrySettings();
	});
	ipcMain.handle("get-blurry-selected", (event) => {
		if (!isRecorderWindow(event.sender.id)) throw new Error("Recorder window required");
		return getBlurrySelected();
	});
	ipcMain.handle("set-blurry-selected", (event, selected: unknown) => {
		if (!isRecorderWindow(event.sender.id)) throw new Error("Recorder window required");
		if (typeof selected !== "boolean") throw new Error("A boolean is required");
		return setBlurrySelected(selected);
	});
}
