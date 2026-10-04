import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";
import { quietRecordingCommand } from "../../electron/recording/quiet-recording-scripts";

function readQuietProfile() {
	const command = quietRecordingCommand("win32");
	const output = execFileSync(command.file, command.args, {
		windowsHide: true,
		input: "",
		encoding: "utf8",
		timeout: 15_000,
		env: { ...process.env, OPENSCREEN_QUIET_PROBE: "1" },
	});
	const response = output
		.trim()
		.split(/\r?\n/)
		.map((line) => JSON.parse(line))
		.find((value) => value.ready === true);
	if (typeof response?.previousProfile !== "string")
		throw new Error("Cannot read Windows quiet profile");
	return response.previousProfile as string;
}

async function centerPixel(view: Page) {
	return view.getByTestId("recording-preview-screen").evaluate((video: HTMLVideoElement) => {
		if (video.readyState < 2 || !video.videoWidth) return [];
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		const context = canvas.getContext("2d");
		if (!context) return [];
		context.drawImage(video, video.videoWidth / 2, video.videoHeight / 2, 1, 1, 0, 0, 1, 1);
		return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
	});
}

function moveCursor(point: { x: number; y: number }) {
	execFileSync(
		"powershell.exe",
		[
			"-NoProfile",
			"-Command",
			`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class PreviewMouse { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int x, int y, uint data, UIntPtr extra); }'; if (![PreviewMouse]::SetCursorPos(${Math.round(point.x)},${Math.round(point.y)})) { throw 'Cannot position test cursor' }; [PreviewMouse]::mouse_event(1,1,0,0,[UIntPtr]::Zero); [PreviewMouse]::mouse_event(1,-1,0,0,[UIntPtr]::Zero)`,
		],
		{ windowsHide: true },
	);
}

async function cursorPixels(view: Page) {
	return view.getByTestId("recording-preview-screen").evaluate((video: HTMLVideoElement) => {
		if (video.readyState < 2 || !video.videoWidth) return -1;
		const canvas = document.createElement("canvas");
		canvas.width = 96;
		canvas.height = 96;
		const context = canvas.getContext("2d")!;
		context.drawImage(
			video,
			video.videoWidth / 2 - 48,
			video.videoHeight / 2 - 48,
			96,
			96,
			0,
			0,
			96,
			96,
		);
		const data = context.getImageData(0, 0, 96, 96).data;
		let count = 0;
		for (let i = 0; i < data.length; i += 4) {
			if (
				(data[i] < 60 && data[i + 1] < 60 && data[i + 2] < 60) ||
				(data[i] > 190 && data[i + 1] > 190 && data[i + 2] > 190)
			)
				count++;
		}
		return count;
	});
}

test("live viewer switches source, resizes, and does not interrupt native MP4 recording", async () => {
	test.skip(process.platform !== "win32", "Windows capture exclusion required");
	test.setTimeout(240_000);
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-recording-preview-"));
	const quietBefore =
		process.env.OPENSCREEN_TEST_REAL_QUIET === "1" ? readQuietProfile() : undefined;
	if (quietBefore)
		fs.writeFileSync(
			path.join(profile, "after-recording.json"),
			JSON.stringify({ mode: "editor", quietRecording: true }),
		);
	const environment = { ...process.env, HEADLESS: "true" };
	if (!process.env.OPENSCREEN_TEST_EXECUTABLE) {
		environment.OPENSCREEN_WGC_CAPTURE_EXE = path.resolve(
			"electron/native/bin/win32-x64/wgc-capture.exe",
		);
	}
	delete environment.ELECTRON_RUN_AS_NODE;
	const app = await electron.launch({
		...(process.env.OPENSCREEN_TEST_EXECUTABLE
			? { executablePath: process.env.OPENSCREEN_TEST_EXECUTABLE }
			: {}),
		args: [
			...(process.env.OPENSCREEN_TEST_EXECUTABLE ? [] : [path.resolve("dist-electron/main.js")]),
			`--user-data-dir=${profile}`,
			"--no-sandbox",
			"--enable-unsafe-swiftshader",
			...(process.env.OPENSCREEN_TEST_REAL_CAMERA ? [] : ["--use-fake-device-for-media-stream"]),
			"--lang=en-US",
		],
		env: environment,
	});
	app.process().stdout?.on("data", (data) => console.log(`PREVIEW_MAIN=${data}`));
	app.process().stderr?.on("data", (data) => console.log(`PREVIEW_MAIN_ERROR=${data}`));
	const originalCursor = await app.evaluate(({ screen }) =>
		screen.dipToScreenPoint(screen.getCursorScreenPoint()),
	);
	try {
		if (process.env.OPENSCREEN_TEST_EXECUTABLE) {
			expect(await app.evaluate(({ app }) => app.getVersion())).toBe(
				JSON.parse(fs.readFileSync("package.json", "utf8")).version,
			);
		}
		const hud = await app.firstWindow();
		hud.on("pageerror", (error) => console.log(`HUD_PAGE_ERROR=${error.message}`));
		hud.on("console", (message) => {
			if (message.type() === "error") console.log(`HUD_ERROR=${message.text()}`);
		});
		hud.on("requestfailed", (request) =>
			console.log(`HUD_REQUEST_FAILED=${request.url()} ${request.failure()?.errorText}`),
		);
		await hud.evaluate(() => {
			const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
			(globalThis as Record<string, unknown>).__cameraTracks = [];
			navigator.mediaDevices.getUserMedia = async (options) => {
				const stream = await original(options);
				if (options?.video)
					((globalThis as Record<string, unknown>).__cameraTracks as MediaStreamTrack[]).push(
						...stream.getVideoTracks(),
					);
				return stream;
			};
		});
		await expect(hud.getByTestId("launch-recording-preview-button")).toBeAttached({
			timeout: 30_000,
		});
		await expect(hud.getByTestId("launch-recording-preview-button")).toBeDisabled();
		await app.evaluate(async ({ BrowserWindow, screen }) => {
			const { workArea } = screen.getPrimaryDisplay();
			const targets = [];
			for (const [index, color] of ["rgb(230,30,40)", "rgb(30,60,230)"].entries()) {
				const target = new BrowserWindow({
					width: index ? 280 : 600,
					height: index ? 520 : 400,
					x: workArea.x + 20 + index * 320,
					y: workArea.y + 50,
					title: `Openscreen preview test source ${index} with a long title to verify truncation`,
					show: false,
					webPreferences: { backgroundThrottling: false },
				});
				target.setMenu(null);
				target.setAlwaysOnTop(true);
				await target.loadURL(
					`data:text/html,${encodeURIComponent(`<html><body style="margin:0;background:${color}"><canvas></canvas><script>window.previewColor='${color}'; const c=document.querySelector('canvas'); const ctx=c.getContext('2d'); function paint(){c.width=innerWidth;c.height=innerHeight;ctx.fillStyle=window.previewColor;ctx.fillRect(0,0,c.width,c.height);requestAnimationFrame(paint)}paint();</script></body></html>`)}`,
				);
				target.showInactive();
				targets.push(target);
			}
			(globalThis as Record<string, unknown>).__previewTargets = targets;
		});
		const chooseSource = async (index: number) => {
			const sources = await hud.evaluate(() =>
				window.electronAPI.getSources({
					types: ["window"],
					thumbnailSize: { width: 0, height: 0 },
				}),
			);
			const source = sources.find((item) =>
				item.name.startsWith(`Openscreen preview test source ${index}`),
			);
			expect(source).toBeTruthy();
			await hud.evaluate((selected) => window.electronAPI.selectSource(selected), source!);
		};
		await chooseSource(0);
		await expect(hud.getByTestId("launch-recording-preview-button")).toBeEnabled();
		let next = app.waitForEvent("window");
		await hud.getByTestId("launch-recording-preview-button").click();
		let view = await next;
		await view.waitForLoadState("domcontentloaded");
		view.on("console", (message) => {
			if (message.type() === "error") console.log(`PREVIEW_ERROR=${message.text()}`);
		});
		await view.evaluate(() => {
			navigator.mediaDevices.getUserMedia = async () => {
				throw new Error("Viewer must share the camera, not reopen it");
			};
		});
		expect(view.url()).toContain("windowType=recording-preview");
		const preview = await app.browserWindow(view);
		expect(await preview.evaluate((win) => win.isContentProtected())).toBe(true);
		await preview.evaluate((win) => {
			win.setOpacity(1);
			win.showInactive();
		});
		const handle = await preview.evaluate((win) => {
			const buffer = win.getNativeWindowHandle();
			return buffer.length === 8
				? buffer.readBigUInt64LE().toString()
				: String(buffer.readUInt32LE());
		});
		const affinity = execFileSync(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class PreviewAffinity { [DllImport("user32.dll", SetLastError=true)] public static extern bool GetWindowDisplayAffinity(IntPtr hwnd, out uint affinity); }'; [uint32]$affinity=0; if (![PreviewAffinity]::GetWindowDisplayAffinity([IntPtr]::new([int64]${handle}),[ref]$affinity)) { throw [Runtime.InteropServices.Marshal]::GetLastWin32Error() }; Write-Output $affinity`,
			],
			{ encoding: "utf8", windowsHide: true },
		);
		expect(Number(affinity.trim())).toBe(17);
		await expect
			.poll(async () => (await centerPixel(view))[0], { timeout: 30_000 })
			.toBeGreaterThan(200);
		const cursorPoint = await app.evaluate(({ screen }) => {
			const target = (
				(globalThis as Record<string, unknown>).__previewTargets as Electron.BrowserWindow[]
			)[0];
			const bounds = target.getContentBounds();
			return screen.dipToScreenPoint({
				x: bounds.x + bounds.width / 2,
				y: bounds.y + bounds.height / 2,
			});
		});
		moveCursor(cursorPoint);
		await expect
			.poll(
				() => {
					moveCursor(cursorPoint);
					return cursorPixels(view);
				},
				{ timeout: 20_000 },
			)
			.toBeGreaterThan(5);
		await hud.getByTestId("launch-cursor-mode-button").click();
		moveCursor(cursorPoint);
		await expect.poll(() => cursorPixels(view), { timeout: 10_000 }).toBe(0);
		await hud.getByTestId("launch-cursor-mode-button").click();
		moveCursor(cursorPoint);
		await expect.poll(() => cursorPixels(view), { timeout: 10_000 }).toBeGreaterThan(5);
		moveCursor(originalCursor);
		await app.evaluate(async () => {
			const targets = (globalThis as Record<string, unknown>)
				.__previewTargets as Electron.BrowserWindow[];
			await targets[0].webContents.executeJavaScript("window.previewColor='rgb(30,230,40)'");
		});
		await expect
			.poll(async () => (await centerPixel(view))[1], { timeout: 10_000 })
			.toBeGreaterThan(200);
		const limits = await view
			.getByTestId("recording-preview-screen")
			.evaluate((video: HTMLVideoElement) =>
				(video.srcObject as MediaStream).getVideoTracks()[0].getSettings(),
			);
		expect(limits.width).toBeLessThanOrEqual(960);
		expect(limits.height).toBeLessThanOrEqual(540);
		expect(limits.frameRate).toBeLessThanOrEqual(15);
		await view.screenshot({ path: path.join(profile, "recording-preview-desktop.png") });
		await view.getByTestId("recording-preview-screen").evaluate((video: HTMLVideoElement) => {
			(globalThis as Record<string, unknown>).__oldPreviewTrack = (
				video.srcObject as MediaStream
			).getVideoTracks()[0];
		});
		await chooseSource(1);
		await expect
			.poll(async () => (await centerPixel(view))[2], { timeout: 30_000 })
			.toBeGreaterThan(200);
		expect(
			await view.evaluate(
				() =>
					((globalThis as Record<string, unknown>).__oldPreviewTrack as MediaStreamTrack)
						.readyState,
			),
		).toBe("ended");
		await preview.evaluate((win) => win.setContentSize(280, 220));
		await view.screenshot({ path: path.join(profile, "recording-preview-compact.png") });
		const fits = await view.evaluate(() => {
			const header = document.querySelector("header")!.getBoundingClientRect();
			const video = document
				.querySelector('[data-testid="recording-preview-screen"]')!
				.getBoundingClientRect();
			return (
				document.documentElement.scrollWidth <= innerWidth &&
				document.documentElement.scrollHeight <= innerHeight &&
				video.top >= header.bottom &&
				video.bottom <= innerHeight
			);
		});
		expect(fits).toBe(true);
		await hud.getByTestId("launch-webcam-button").click();
		await expect(view.getByTestId("recording-preview-webcam")).toBeVisible({ timeout: 30_000 });
		await expect
			.poll(() =>
				view
					.getByTestId("recording-preview-webcam")
					.evaluate((video: HTMLVideoElement) => video.currentTime),
			)
			.toBeGreaterThan(0.1);
		const webcamBounds = await view.getByTestId("recording-preview-webcam").boundingBox();
		const frameBounds = await view.getByTestId("recording-preview-screen").boundingBox();
		expect(webcamBounds!.x).toBeGreaterThanOrEqual(frameBounds!.x);
		expect(webcamBounds!.y).toBeGreaterThanOrEqual(frameBounds!.y);
		expect(webcamBounds!.x + webcamBounds!.width).toBeLessThanOrEqual(
			frameBounds!.x + frameBounds!.width,
		);
		expect(webcamBounds!.y + webcamBounds!.height).toBeLessThanOrEqual(
			frameBounds!.y + frameBounds!.height,
		);
		expect(webcamBounds!.x + webcamBounds!.width).toBeLessThanOrEqual(280);
		expect(webcamBounds!.y + webcamBounds!.height).toBeLessThanOrEqual(220);
		await view.screenshot({ path: path.join(profile, "recording-preview-webcam-compact.png") });
		await hud.getByTestId("launch-webcam-button").click();
		await expect(view.getByTestId("recording-preview-webcam")).toBeHidden();
		await view.getByTestId("recording-preview-screen").evaluate((video: HTMLVideoElement) => {
			(globalThis as Record<string, unknown>).__minimizedTrack = (
				video.srcObject as MediaStream
			).getVideoTracks()[0];
		});
		await preview.evaluate((win) => win.minimize());
		await expect
			.poll(() =>
				view.evaluate(
					() =>
						((globalThis as Record<string, unknown>).__minimizedTrack as MediaStreamTrack)
							.readyState,
				),
			)
			.toBe("ended");
		await preview.evaluate((win) => {
			win.restore();
			win.showInactive();
		});
		await expect
			.poll(async () => (await centerPixel(view))[2], { timeout: 30_000 })
			.toBeGreaterThan(200);
		await preview.evaluate((win) => win.close());
		await expect(hud.getByTestId("launch-recording-preview-button")).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		for (const id of ["launch-system-audio-button", "launch-microphone-button"]) {
			if ((await hud.getByTestId(id).getAttribute("title"))?.startsWith("Disable"))
				await hud.getByTestId(id).click();
		}
		const cursorMode = hud.getByTestId("launch-cursor-mode-button");
		if ((await cursorMode.getAttribute("aria-pressed")) === "true") await cursorMode.click();
		await expect(cursorMode).toHaveAttribute("aria-pressed", "false");
		await hud.getByTestId("launch-webcam-button").click();
		await expect(hud.getByTestId("launch-webcam-button")).toHaveAttribute(
			"title",
			"Disable webcam",
		);
		expect(
			(await hud.evaluate(() => window.electronAPI.isNativeWindowsCaptureAvailable())).available,
		).toBe(true);
		await hud.getByTestId("launch-record-button").click();
		await expect(hud.getByTestId("launch-source-selector-button")).toBeDisabled({
			timeout: 30_000,
		});
		await expect(hud.getByTestId("launch-record-button").locator("span")).toHaveText(/\d+:\d+/, {
			timeout: 30_000,
		});
		if (quietBefore)
			expect(readQuietProfile()).toBe(
				quietBefore === "Microsoft.QuietHoursProfile.Unrestricted"
					? "Microsoft.QuietHoursProfile.AlarmsOnly"
					: quietBefore,
			);
		next = app.waitForEvent("window");
		await hud.getByTestId("launch-recording-preview-button").click();
		view = await next;
		await (await app.browserWindow(view)).evaluate((win) => win.showInactive());
		await expect
			.poll(async () => (await centerPixel(view))[2], { timeout: 30_000 })
			.toBeGreaterThan(200);
		await expect(view.getByTestId("recording-preview-webcam")).toBeVisible({ timeout: 30_000 });
		await expect
			.poll(
				() =>
					view
						.getByTestId("recording-preview-webcam")
						.evaluate((video: HTMLVideoElement) => video.currentTime),
				{ timeout: 30_000 },
			)
			.toBeGreaterThan(0.1);
		await (await app.browserWindow(view)).evaluate((win) => win.close());
		await expect(hud.getByTestId("launch-source-selector-button")).toBeDisabled();
		expect(
			await hud.evaluate(() =>
				((globalThis as Record<string, unknown>).__cameraTracks as MediaStreamTrack[]).some(
					(track) => track.readyState === "live",
				),
			),
		).toBe(true);
		await expect(hud.getByTestId("launch-recording-preview-button")).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		next = app.waitForEvent("window");
		await hud.getByTestId("launch-recording-preview-button").click();
		view = await next;
		await expect(view.getByTestId("recording-preview-webcam")).toBeVisible({ timeout: 30_000 });
		await expect
			.poll(async () => (await centerPixel(view))[2], { timeout: 30_000 })
			.toBeGreaterThan(200);
		const editorWindow = app.waitForEvent("window");
		await hud.getByTestId("launch-record-button").click();
		const editor = await editorWindow;
		await editor.waitForLoadState("domcontentloaded");
		expect(editor.url()).toContain("windowType=editor");
		if (quietBefore) expect(readQuietProfile()).toBe(quietBefore);
		await expect
			.poll(() => editor.evaluate(() => window.electronAPI.getRecordingPreviewState()))
			.toEqual({ supported: true, open: false, visible: false });
		const saved = await editor.evaluate(() => window.electronAPI.getCurrentVideoPath());
		expect(saved.path).toMatch(/\.mp4$/i);
		const bytes = fs.readFileSync(saved.path!);
		const session = await editor.evaluate(() => window.electronAPI.getCurrentRecordingSession());
		expect(session.session?.cursorCaptureMode).toBe("hidden");
		expect(session.session?.webcamVideoPath).toBeTruthy();
		expect(fs.statSync(session.session!.webcamVideoPath!).size).toBeGreaterThan(1024);
		expect(bytes.length).toBeGreaterThan(1024);
		expect(bytes.subarray(4, 8).toString()).toBe("ftyp");
		console.log(`RECORDING_PREVIEW_VALIDATION=${profile}`);
	} finally {
		moveCursor(originalCursor);
		const renderer = app.windows().find((page) => page.url().includes("windowType="));
		await renderer
			?.evaluate(() => window.electronAPI.stopNativeWindowsRecording(true))
			.catch(() => undefined);
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
		await app.close().catch(() => undefined);
		if (quietBefore)
			await expect.poll(() => readQuietProfile(), { timeout: 20_000 }).toBe(quietBefore);
	}
});

test("live viewer receives frames from every connected monitor", async () => {
	test.skip(process.platform !== "win32", "Windows capture exclusion required");
	test.setTimeout(240_000);
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-monitor-preview-"));
	const environment = { ...process.env, HEADLESS: "false" };
	delete environment.ELECTRON_RUN_AS_NODE;
	if (!process.env.OPENSCREEN_TEST_EXECUTABLE)
		environment.OPENSCREEN_WGC_CAPTURE_EXE = path.resolve(
			"electron/native/bin/win32-x64/wgc-capture.exe",
		);
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
		env: environment,
	});
	try {
		const hud = await app.firstWindow();
		await expect(hud.getByTestId("launch-recording-preview-button")).toBeAttached({
			timeout: 30_000,
		});
		const sources = await hud.evaluate(() =>
			window.electronAPI.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } }),
		);
		expect(sources.length).toBeGreaterThan(0);
		for (const source of sources) {
			await hud.evaluate((next) => window.electronAPI.selectSource(next), source);
			const next = app.waitForEvent("window");
			await hud.getByTestId("launch-recording-preview-button").click();
			const view = await next;
			await view.waitForLoadState("domcontentloaded");
			const preview = await app.browserWindow(view);
			expect(await preview.evaluate((win) => win.isContentProtected())).toBe(true);
			await expect.poll(() => preview.evaluate((win) => win.getOpacity())).toBe(1);
			await expect
				.poll(
					() =>
						view
							.getByTestId("recording-preview-screen")
							.evaluate(
								(video: HTMLVideoElement) =>
									video.readyState >= 2 && video.videoWidth > 0 && video.currentTime > 0.1,
							),
					{ timeout: 30_000 },
				)
				.toBe(true);
			await expect(view.getByRole("alert")).toHaveCount(0);
			console.log(`MONITOR_PREVIEW_OK=${source.name}`);
			await preview.evaluate((win) => win.close());
			await expect(hud.getByTestId("launch-recording-preview-button")).toHaveAttribute(
				"aria-pressed",
				"false",
			);
		}
		console.log(`MONITOR_PREVIEW_VALIDATION=${profile}`);
	} finally {
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
		await app.close().catch(() => undefined);
	}
});

test("quiet recording activates during native capture and restores after stop", async () => {
	test.skip(
		process.platform !== "win32" || process.env.OPENSCREEN_TEST_REAL_QUIET !== "1",
		"Explicit native quiet-mode test required",
	);
	test.setTimeout(120_000);
	const before = readQuietProfile();
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-quiet-recording-"));
	fs.writeFileSync(
		path.join(profile, "after-recording.json"),
		JSON.stringify({ mode: "editor", quietRecording: true }),
	);
	const environment = { ...process.env, HEADLESS: "true" };
	delete environment.ELECTRON_RUN_AS_NODE;
	if (!process.env.OPENSCREEN_TEST_EXECUTABLE)
		environment.OPENSCREEN_WGC_CAPTURE_EXE = path.resolve(
			"electron/native/bin/win32-x64/wgc-capture.exe",
		);
	const app = await electron.launch({
		...(process.env.OPENSCREEN_TEST_EXECUTABLE
			? { executablePath: process.env.OPENSCREEN_TEST_EXECUTABLE }
			: {}),
		args: [
			...(process.env.OPENSCREEN_TEST_EXECUTABLE ? [] : [path.resolve("dist-electron/main.js")]),
			`--user-data-dir=${profile}`,
			"--no-sandbox",
		],
		env: environment,
	});
	try {
		const hud = await app.firstWindow();
		await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30_000 });
		await app.evaluate(async ({ BrowserWindow, screen }) => {
			const { workArea } = screen.getPrimaryDisplay();
			const target = new BrowserWindow({
				width: 640,
				height: 360,
				x: workArea.x + 30,
				y: workArea.y + 30,
				show: false,
				title: "Openscreen quiet recording test source",
			});
			target.setMenu(null);
			target.setAlwaysOnTop(true);
			await target.loadURL(
				"data:text/html,<html><body style='background:%2324a879;color:white'><h1>Quiet recording test</h1></body></html>",
			);
			target.showInactive();
		});
		const sources = await hud.evaluate(() =>
			window.electronAPI.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 } }),
		);
		const selected = sources.find((item) =>
			item.name.startsWith("Openscreen quiet recording test source"),
		);
		expect(selected).toBeTruthy();
		await hud.evaluate((source) => window.electronAPI.selectSource(source), selected!);
		for (const id of ["launch-system-audio-button", "launch-microphone-button"]) {
			if ((await hud.getByTestId(id).getAttribute("title"))?.startsWith("Disable"))
				await hud.getByTestId(id).click();
		}
		expect(
			(await hud.evaluate(() => window.electronAPI.isNativeWindowsCaptureAvailable())).available,
		).toBe(true);
		await hud.getByTestId("launch-record-button").click();
		await expect(hud.getByTestId("launch-source-selector-button")).toBeDisabled({
			timeout: 30_000,
		});
		await expect(hud.getByTestId("launch-record-button").locator("span")).toHaveText(/\d+:\d+/, {
			timeout: 30_000,
		});
		expect(readQuietProfile()).toBe(
			before === "Microsoft.QuietHoursProfile.Unrestricted"
				? "Microsoft.QuietHoursProfile.AlarmsOnly"
				: before,
		);
		await hud.waitForTimeout(2000);
		const next = app.waitForEvent("window");
		await hud.getByTestId("launch-record-button").click();
		const editor = await next;
		await editor.waitForLoadState("domcontentloaded");
		expect(editor.url()).toContain("windowType=editor");
		expect(readQuietProfile()).toBe(before);
		const saved = await editor.evaluate(() => window.electronAPI.getCurrentVideoPath());
		expect(saved.path).toMatch(/\.mp4$/i);
		const bytes = fs.readFileSync(saved.path!);
		expect(bytes.length).toBeGreaterThan(1024);
		expect(bytes.subarray(4, 8).toString()).toBe("ftyp");
		console.log(`QUIET_RECORDING_VALIDATION=${profile}`);
	} finally {
		const renderer = app.windows().find((page) => !page.url().startsWith("data:"));
		await renderer
			?.evaluate(() => window.electronAPI.stopNativeWindowsRecording(true))
			.catch(() => undefined);
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
		await app.close().catch(() => undefined);
		await expect.poll(() => readQuietProfile(), { timeout: 20_000 }).toBe(before);
	}
});

test("quiet recording restores after recorder process termination", async () => {
	test.skip(
		process.platform !== "win32" || process.env.OPENSCREEN_TEST_REAL_QUIET !== "1",
		"Explicit native quiet-mode test required",
	);
	test.setTimeout(90_000);
	const before = readQuietProfile();
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-quiet-recovery-"));
	fs.writeFileSync(
		path.join(profile, "after-recording.json"),
		JSON.stringify({ mode: "editor", quietRecording: true }),
	);
	const environment = { ...process.env, HEADLESS: "true" };
	delete environment.ELECTRON_RUN_AS_NODE;
	const app = await electron.launch({
		...(process.env.OPENSCREEN_TEST_EXECUTABLE
			? { executablePath: process.env.OPENSCREEN_TEST_EXECUTABLE }
			: {}),
		args: [
			...(process.env.OPENSCREEN_TEST_EXECUTABLE ? [] : [path.resolve("dist-electron/main.js")]),
			`--user-data-dir=${profile}`,
			"--no-sandbox",
		],
		env: environment,
	});
	try {
		const hud = await app.firstWindow();
		await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30_000 });
		await hud.evaluate(() => window.electronAPI.prepareQuietRecording());
		expect(readQuietProfile()).toBe(
			before === "Microsoft.QuietHoursProfile.Unrestricted"
				? "Microsoft.QuietHoursProfile.AlarmsOnly"
				: before,
		);
		// No screen capture is started: only this isolated test app and its quiet lease exist.
		const mainPid = await app.evaluate(() => globalThis.process.pid);
		const process = app.process();
		const exited = new Promise<void>((resolve) => process.once("exit", () => resolve()));
		// On Windows Playwright's launched process is a cmd shell, not Electron itself.
		execFileSync(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-Command", `Stop-Process -Id ${mainPid}`],
			{ windowsHide: true, timeout: 15000 },
		);
		await exited;
		await expect.poll(() => readQuietProfile(), { timeout: 20_000 }).toBe(before);
		console.log(`QUIET_RECOVERY_VALIDATION=${profile}`);
	} finally {
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
		await app.close().catch(() => undefined);
		await expect.poll(() => readQuietProfile(), { timeout: 20_000 }).toBe(before);
	}
});
