import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("window capture includes an owned dropdown-style popup", async () => {
	test.skip(process.platform !== "win32");
	test.setTimeout(120_000);
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-window-popup-"));
	fs.writeFileSync(
		path.join(profile, "after-recording.json"),
		JSON.stringify({ mode: "editor", quietRecording: false }),
	);
	const env = { ...process.env, HEADLESS: "false" };
	delete env.ELECTRON_RUN_AS_NODE;
	const executablePath = process.env.OPENSCREEN_TEST_EXECUTABLE;
	if (executablePath) {
		delete env.VITE_DEV_SERVER_URL;
		delete env.OPENSCREEN_WGC_CAPTURE_EXE;
	} else {
		env.OPENSCREEN_WGC_CAPTURE_EXE = path.resolve("electron/native/bin/win32-x64/wgc-capture.exe");
	}
	const app = await electron.launch({
		...(executablePath ? { executablePath } : {}),
		args: [
			...(executablePath
				? []
				: [path.resolve(process.env.OPENSCREEN_TEST_MAIN ?? "dist-electron/main.js")]),
			`--user-data-dir=${profile}`,
			"--no-sandbox",
			"--lang=en-US",
		],
		env,
	});
	try {
		const hud = await app.firstWindow();
		await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30_000 });
		await app.evaluate(async ({ BrowserWindow }) => {
			const target = new BrowserWindow({
				width: 640,
				height: 360,
				show: false,
				title: "Popup capture test source",
			});
			await target.loadURL("data:text/html,<body style='margin:0;background:black'></body>");
			target.showInactive();
			(globalThis as Record<string, unknown>).__popupCaptureTarget = target;
		});
		const sources = await hud.evaluate(() =>
			window.electronAPI.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 } }),
		);
		const source = sources.find((item) => item.name === "Popup capture test source");
		expect(source).toBeTruthy();
		await hud.evaluate((selected) => window.electronAPI.selectSource(selected), source!);
		for (const id of [
			"launch-system-audio-button",
			"launch-microphone-button",
			"launch-webcam-button",
		]) {
			if ((await hud.getByTestId(id).getAttribute("title"))?.startsWith("Disable"))
				await hud.getByTestId(id).click();
		}
		await hud.getByTestId("launch-record-button").click();
		await expect(hud.getByTestId("launch-record-button").locator("span")).toHaveText(/\d+:\d+/, {
			timeout: 30_000,
		});
		await hud.waitForTimeout(500);
		await app.evaluate(({ Menu }) => {
			const target = (globalThis as Record<string, unknown>)
				.__popupCaptureTarget as Electron.BrowserWindow;
			const popup = Menu.buildFromTemplate([
				{ label: "Dropdown capture marker" },
				{ type: "separator" },
				{ label: "First option" },
				{ label: "Second option" },
			]);
			(globalThis as Record<string, unknown>).__popupCaptureMenu = popup;
			target.focus();
			popup.popup({ window: target, x: 180, y: 120 });
		});
		await hud.waitForTimeout(500);
		await hud.waitForTimeout(1_500);
		const studio = app.waitForEvent("window", { timeout: 60_000 });
		await hud.getByTestId("launch-record-button").click();
		const editor = await studio;
		await expect.poll(() => editor.evaluate(() => typeof window.electronAPI)).toBe("object");
		const saved = await editor.evaluate(() => window.electronAPI.getCurrentVideoPath());
		expect(saved.path).toMatch(/\.mp4$/);
		const frame = execFileSync(
			"ffmpeg",
			[
				"-v",
				"error",
				"-ss",
				"2.2",
				"-i",
				saved.path!,
				"-frames:v",
				"1",
				"-vf",
				"scale=320:180",
				"-pix_fmt",
				"rgb24",
				"-f",
				"rawvideo",
				"pipe:1",
			],
			{ windowsHide: true, timeout: 30_000, maxBuffer: 320 * 180 * 3 + 1024 },
		);
		let popupPixels = 0;
		for (let y = 60; y < 170; y += 1) {
			for (let x = 60; x < 310; x += 1) {
				const index = (y * 320 + x) * 3;
				if (frame[index] > 150 && frame[index + 1] > 150 && frame[index + 2] > 150)
					popupPixels += 1;
			}
		}
		expect(popupPixels).toBeGreaterThan(300);
		console.log(
			`WINDOW_POPUP_VALIDATION=${JSON.stringify({ profile, path: saved.path, popupPixels })}`,
		);
	} finally {
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
		await app.close().catch(() => undefined);
	}
});
