import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("visible post-recording Studio is raised above the previous foreground window", async () => {
	test.skip(process.platform !== "win32");
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-window-foreground-"));
	fs.writeFileSync(
		path.join(profile, "after-recording.json"),
		JSON.stringify({ mode: "editor", hideAfterRecording: false }),
	);
	const env = { ...process.env, HEADLESS: "false" };
	delete env.ELECTRON_RUN_AS_NODE;
	if (process.env.OPENSCREEN_TEST_EXECUTABLE) delete env.VITE_DEV_SERVER_URL;
	const app = await electron.launch({
		...(process.env.OPENSCREEN_TEST_EXECUTABLE
			? { executablePath: process.env.OPENSCREEN_TEST_EXECUTABLE }
			: {}),
		args: [
			...(process.env.OPENSCREEN_TEST_EXECUTABLE ? [] : [path.resolve("dist-electron/main.js")]),
			`--user-data-dir=${profile}`,
			"--no-sandbox",
		],
		env,
	});
	try {
		const hud = await app.firstWindow();
		await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30_000 });
		const fixture = path.join(profile, "recordings", "foreground.webm");
		fs.mkdirSync(path.dirname(fixture), { recursive: true });
		fs.copyFileSync(path.resolve("tests/fixtures/sample.webm"), fixture);
		expect(
			await hud.evaluate((file) => window.electronAPI.setCurrentVideoPath(file), fixture),
		).toMatchObject({ success: true });
		await app.evaluate(async ({ BrowserWindow }) => {
			const blocker = new BrowserWindow({ width: 700, height: 500, show: false });
			await blocker.loadURL("data:text/html,<body>Previous foreground window</body>");
			blocker.show();
			blocker.focus();
			blocker.moveTop();
		});
		const editorOpened = app.waitForEvent("window");
		await hud
			.evaluate(() => window.electronAPI.finishRecording())
			.catch((error) => {
				if (!/closed|destroyed/i.test(String(error))) throw error;
			});
		const editor = await editorOpened;
		await expect.poll(() => editor.evaluate(() => typeof window.electronAPI)).toBe("object");
		const editorWindow = await app.browserWindow(editor);
		await expect.poll(() => editorWindow.evaluate((window) => window.isVisible())).toBe(true);
		await expect.poll(() => editorWindow.evaluate((window) => window.isFocused())).toBe(true);
		await expect.poll(() => editorWindow.evaluate((window) => window.isAlwaysOnTop())).toBe(false);
		console.log(`WINDOW_FOREGROUND_VALIDATION=${profile}`);
	} finally {
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
	}
});

for (const flags of [
	{ hideAfterRecording: false, hideAfterVideo: false },
	{ hideAfterRecording: false, hideAfterVideo: true },
	{ hideAfterRecording: true, hideAfterVideo: false },
	{ hideAfterRecording: true, hideAfterVideo: true },
]) {
	test(`recording and video hide options control visibility (${JSON.stringify(flags)}) without quitting`, async () => {
		test.setTimeout(180_000);
		const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-window-lifecycle-"));
		fs.writeFileSync(
			path.join(profile, "after-recording.json"),
			JSON.stringify({
				mode: "editor",
				...flags,
			}),
		);
		const env = { ...process.env, HEADLESS: "false" };
		delete env.ELECTRON_RUN_AS_NODE;
		if (process.env.OPENSCREEN_TEST_EXECUTABLE) delete env.VITE_DEV_SERVER_URL;
		const app = await electron.launch({
			...(process.env.OPENSCREEN_TEST_EXECUTABLE
				? { executablePath: process.env.OPENSCREEN_TEST_EXECUTABLE }
				: {}),
			args: [
				...(process.env.OPENSCREEN_TEST_EXECUTABLE ? [] : [path.resolve("dist-electron/main.js")]),
				`--user-data-dir=${profile}`,
				"--no-sandbox",
				"--lang=en-US",
			],
			env,
		});
		try {
			let hud = await app.firstWindow();
			await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30_000 });
			const realCapture =
				flags.hideAfterRecording && flags.hideAfterVideo && process.platform === "win32";
			if (realCapture) {
				await app.evaluate(async ({ BrowserWindow }) => {
					const target = new BrowserWindow({
						width: 640,
						height: 360,
						show: false,
						title: "Openscreen hide test source",
					});
					await target.loadURL(
						"data:text/html,<body style='background:%2324a879;color:white'>Hide recording test</body>",
					);
					target.showInactive();
				});
				const sources = await hud.evaluate(() =>
					window.electronAPI.getSources({
						types: ["window"],
						thumbnailSize: { width: 0, height: 0 },
					}),
				);
				const source = sources.find((item) => item.name === "Openscreen hide test source");
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
				expect(
					(await hud.evaluate(() => window.electronAPI.isNativeWindowsCaptureAvailable()))
						.available,
				).toBe(true);
				await hud.getByTestId("launch-record-button").click();
				await expect(hud.getByTestId("launch-record-button").locator("span")).toHaveText(
					/\d+:\d+/,
					{ timeout: 30_000 },
				);
				await hud.waitForTimeout(1500);
			}
			const nextEditor = app.waitForEvent("window");
			if (realCapture) await hud.getByTestId("launch-record-button").click();
			else
				await hud.evaluate(() => {
					void window.electronAPI.finishRecording();
				});
			let editor = await nextEditor;
			await expect.poll(() => editor.evaluate(() => typeof window.electronAPI)).toBe("object");
			if (realCapture) {
				const saved = await editor.evaluate(() => window.electronAPI.getCurrentVideoPath());
				expect(saved.path).toMatch(/\.mp4$/i);
				const bytes = fs.readFileSync(saved.path!);
				expect(bytes.length).toBeGreaterThan(1024);
				expect(bytes.subarray(4, 8).toString()).toBe("ftyp");
				await app.evaluate(({ BrowserWindow }) =>
					BrowserWindow.getAllWindows()
						.find((window) => window.getTitle() === "Openscreen hide test source")
						?.destroy(),
				);
			}
			let editorWindow = await app.browserWindow(editor);
			await expect
				.poll(() => editorWindow.evaluate((window) => window.webContents.isLoading()))
				.toBe(false);
			await expect
				.poll(() => editorWindow.evaluate((window) => window.isVisible()))
				.toBe(!flags.hideAfterRecording);
			await editorWindow.evaluate((window) => window.show());
			const savedFile = path.join(profile, "saved-video.mp4");
			fs.writeFileSync(savedFile, "visibility-event fixture; not a real exported video");
			await editor.evaluate((file) => window.electronAPI.recordingVideoSaved(file), savedFile);
			await expect
				.poll(() => editorWindow.evaluate((window) => window.isVisible()))
				.toBe(!flags.hideAfterVideo);
			await editorWindow.evaluate((window) => window.show());
			const nextHud = app.waitForEvent("window");
			await editor.evaluate(() => {
				void window.electronAPI.dismissRecordingVideo();
			});
			hud = await nextHud;
			await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30_000 });
			let hudWindow = await app.browserWindow(hud);
			await expect
				.poll(() => hudWindow.evaluate((window) => window.isVisible()))
				.toBe(!flags.hideAfterVideo);
			await hudWindow.evaluate((window) => window.show());
			const studio = app.waitForEvent("window");
			await hud.getByTestId("launch-open-studio-button").click();
			editor = await studio;
			await expect.poll(() => editor.evaluate(() => typeof window.electronAPI)).toBe("object");
			editorWindow = await app.browserWindow(editor);
			const recorder = app.waitForEvent("window");
			await editorWindow.evaluate((window) => window.close());
			hud = await recorder;
			await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30_000 });
			hudWindow = await app.browserWindow(hud);
			await expect
				.poll(() => hudWindow.evaluate((window) => window.isVisible()))
				.toBe(!flags.hideAfterVideo);
			expect(await app.evaluate(({ app }) => app.isReady())).toBe(true);
			console.log(`WINDOW_LIFECYCLE_VALIDATION=${profile}`);
			const quit = app.waitForEvent("close");
			await app.evaluate(({ app }) => {
				setTimeout(() => app.quit(), 0);
			});
			await quit;
		} finally {
			await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
			await app.close().catch(() => undefined);
		}
	});
}
