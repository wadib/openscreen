import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

test("recording choices survive Studio close, recording dismissal and app restart", async () => {
	test.setTimeout(180_000);
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-recording-preferences-"));
	const env = { ...process.env, HEADLESS: "false" };
	delete env.ELECTRON_RUN_AS_NODE;
	if (process.env.OPENSCREEN_TEST_EXECUTABLE) delete env.VITE_DEV_SERVER_URL;
	const launch = () =>
		electron.launch({
			...(process.env.OPENSCREEN_TEST_EXECUTABLE
				? { executablePath: process.env.OPENSCREEN_TEST_EXECUTABLE }
				: {}),
			args: [
				...(process.env.OPENSCREEN_TEST_EXECUTABLE ? [] : [path.resolve("dist-electron/main.js")]),
				`--user-data-dir=${profile}`,
				"--no-sandbox",
				"--lang=en-US",
				"--use-fake-device-for-media-stream",
				"--use-fake-ui-for-media-stream",
			],
			env,
		});
	const preferences = (hud: Page) =>
		hud.evaluate(() =>
			JSON.parse(localStorage.getItem("openscreen_recording_preferences_v1") ?? "null"),
		);
	const expectEnabled = async (hud: Page) => {
		await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30_000 });
		for (const id of [
			"launch-microphone-button",
			"launch-system-audio-button",
			"launch-webcam-button",
		]) {
			await expect(hud.getByTestId(id)).toHaveAttribute("title", /^Disable/);
		}
		if (process.platform === "win32" || process.platform === "darwin")
			await expect(hud.getByTestId("launch-cursor-mode-button")).toHaveAttribute(
				"aria-pressed",
				"false",
			);
	};
	let app = await launch();
	try {
		let hud = await app.firstWindow();
		await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30_000 });
		for (const id of [
			"launch-microphone-button",
			"launch-system-audio-button",
			"launch-webcam-button",
		]) {
			await hud.getByTestId(id).click();
		}
		if (process.platform === "win32" || process.platform === "darwin")
			await hud.getByTestId("launch-cursor-mode-button").click();
		await expectEnabled(hud);
		await expect.poll(async () => (await preferences(hud))?.webcamDeviceId).toBeTruthy();
		await expect.poll(async () => (await preferences(hud))?.microphoneDeviceId).toBeTruthy();
		await expect.poll(async () => (await preferences(hud))?.microphoneDeviceName).toBeTruthy();
		await expect.poll(async () => (await preferences(hud))?.webcamDeviceName).toBeTruthy();
		const saved = await preferences(hud);
		const studio = app.waitForEvent("window");
		await hud.getByTestId("launch-open-studio-button").click();
		let editor = await studio;
		await expect.poll(() => editor.evaluate(() => typeof window.electronAPI)).toBe("object");
		const recorder = app.waitForEvent("window");
		await (await app.browserWindow(editor)).evaluate((window) => window.close());
		hud = await recorder;
		await expectEnabled(hud);
		await expect.poll(() => preferences(hud)).toEqual(saved);
		const afterRecording = app.waitForEvent("window");
		await hud.evaluate(() => {
			void window.electronAPI.finishRecording();
		});
		editor = await afterRecording;
		await expect.poll(() => editor.evaluate(() => typeof window.electronAPI)).toBe("object");
		const afterDismiss = app.waitForEvent("window");
		await editor.evaluate(() => {
			void window.electronAPI.dismissRecordingVideo();
		});
		hud = await afterDismiss;
		await expectEnabled(hud);
		await expect.poll(() => preferences(hud)).toEqual(saved);
		await app.close();
		app = await launch();
		hud = await app.firstWindow();
		await expectEnabled(hud);
		await expect.poll(() => preferences(hud)).toEqual(saved);
		await hud.screenshot({ path: path.join(profile, "restored-recording-controls.png") });
		console.log(`RECORDING_PREFERENCES_VALIDATION=${profile}`);
	} finally {
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
		await app.close().catch(() => undefined);
	}
});
