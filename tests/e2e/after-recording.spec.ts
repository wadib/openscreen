import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("Settings is left of Open Studio and contains language and after-recording options", async () => {
	test.setTimeout(90_000);
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-hud-order-"));
	const environment = { ...process.env, HEADLESS: "true" };
	delete environment.ELECTRON_RUN_AS_NODE;
	if (process.env.OPENSCREEN_TEST_EXECUTABLE) delete environment.VITE_DEV_SERVER_URL;
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
		if (process.env.OPENSCREEN_TEST_EXECUTABLE) {
			expect(await app.evaluate(({ app }) => app.getVersion())).toBe(
				JSON.parse(fs.readFileSync("package.json", "utf8")).version,
			);
		}
		const hud = await app.firstWindow();
		await app.evaluate(({ ipcMain }) => {
			ipcMain.removeHandler("get-quiet-recording-support");
			ipcMain.handle("get-quiet-recording-support", () => ({
				available: true,
				detail: "test adapter",
			}));
		});
		const after = hud.getByRole("button", { name: "Settings", exact: true });
		await expect(after).toBeAttached({ timeout: 30_000 });
		const studio = hud.getByTestId("launch-open-studio-button");
		const adjacent = await after.evaluate((button) => {
			const buttons = Array.from(document.querySelectorAll("button"));
			return buttons[buttons.indexOf(button) + 1]?.dataset.testid === "launch-open-studio-button";
		});
		expect(adjacent).toBe(true);
		const afterBounds = await after.boundingBox();
		const studioBounds = await studio.boundingBox();
		expect(afterBounds!.x + afterBounds!.width).toBeLessThanOrEqual(studioBounds!.x);
		await expect(hud.getByRole("button", { name: "Language", exact: true })).toHaveCount(0);
		const next = app.waitForEvent("window");
		await after.click();
		const settings = await next;
		const captureSettings = async (name: string) => {
			const png = await app.evaluate(async ({ BrowserWindow }) => {
				const win = BrowserWindow.getAllWindows().find((candidate) =>
					candidate.webContents.getURL().includes("windowType=settings"),
				);
				if (!win) throw new Error("Settings window is missing");
				const image = await win.webContents.capturePage(undefined, {
					stayHidden: true,
					stayAwake: true,
				});
				if (image.isEmpty()) throw new Error("Settings capture is empty");
				return image.toPNG().toString("base64");
			});
			fs.writeFileSync(path.join(profile, name), Buffer.from(png, "base64"));
		};
		await expect(settings.getByTestId("settings-language")).toBeEnabled({ timeout: 30_000 });
		await expect(settings.getByTestId("settings-after-recording")).toHaveValue("editor");
		await expect(settings.getByTestId("settings-quiet-recording")).not.toBeChecked();
		await expect(settings.getByTestId("settings-hide-after-recording")).not.toBeChecked();
		await expect(settings.getByTestId("settings-hide-after-video")).not.toBeChecked();
		await expect(settings.getByTestId("settings-quiet-recording")).toBeEnabled();
		await expect(
			settings.evaluate(() => window.electronAPI.prepareQuietRecording()),
		).rejects.toThrow("Recorder window required");
		await settings.getByTestId("settings-quiet-recording").check();
		await settings.getByTestId("settings-hide-after-recording").check();
		await settings.getByTestId("settings-hide-after-video").check();
		await captureSettings("settings.png");
		await settings.getByTestId("settings-language").selectOption("es");
		await settings.getByTestId("settings-after-recording").selectOption("export");
		await settings.getByRole("button", { name: "Save", exact: true }).click();
		await expect.poll(() => hud.evaluate(() => document.documentElement.lang)).toBe("es");
		expect(JSON.parse(fs.readFileSync(path.join(profile, "after-recording.json"), "utf8"))).toEqual(
			{ mode: "export", quietRecording: true, hideAfterRecording: true, hideAfterVideo: true },
		);
		const reopen = app.waitForEvent("window");
		await hud.getByTestId("launch-settings-button").click();
		const reopened = await reopen;
		await expect(reopened.getByTestId("settings-language")).toHaveValue("es");
		await expect(reopened.getByTestId("settings-after-recording")).toHaveValue("export");
		await expect(reopened.getByTestId("settings-quiet-recording")).toBeChecked();
		await expect(reopened.getByTestId("settings-hide-after-recording")).toBeChecked();
		await expect(reopened.getByTestId("settings-hide-after-video")).toBeChecked();
		await reopened.getByTestId("settings-hide-after-recording").uncheck();
		await reopened.getByTestId("settings-hide-after-video").uncheck();
		await reopened.getByTestId("settings-quiet-recording").uncheck();
		await reopened.getByTestId("settings-language").selectOption("en");
		await reopened.getByTestId("settings-after-recording").selectOption("editor");
		await reopened.getByRole("button", { name: "Cancelar", exact: true }).click();
		await expect.poll(() => hud.evaluate(() => document.documentElement.lang)).toBe("es");
		expect(JSON.parse(fs.readFileSync(path.join(profile, "after-recording.json"), "utf8"))).toEqual(
			{ mode: "export", quietRecording: true, hideAfterRecording: true, hideAfterVideo: true },
		);
		const external = app.waitForEvent("window");
		await hud.getByTestId("launch-settings-button").click();
		const externalSettings = await external;
		await expect(externalSettings.getByTestId("settings-after-recording")).toBeEnabled();
		await externalSettings.getByTestId("settings-after-recording").selectOption("external");
		await expect(
			externalSettings.getByRole("button", { name: "Guardar", exact: true }),
		).toBeDisabled();
		const editorPath = await app.evaluate(({ app, dialog }) => {
			const file = app.getPath("exe");
			dialog.showOpenDialog = (async () => ({
				canceled: false,
				filePaths: [file],
			})) as typeof dialog.showOpenDialog;
			return file;
		});
		await externalSettings
			.getByRole("button", { name: "Elegir editor de vídeo", exact: true })
			.click();
		await expect(
			externalSettings.getByRole("textbox", { name: "Editor de vídeo", exact: true }),
		).toHaveValue(editorPath);
		await captureSettings("settings-external.png");
		await externalSettings.getByRole("button", { name: "Guardar", exact: true }).click();
		await expect
			.poll(() => JSON.parse(fs.readFileSync(path.join(profile, "after-recording.json"), "utf8")))
			.toEqual({
				mode: "external",
				editorPath,
				quietRecording: true,
				hideAfterRecording: true,
				hideAfterVideo: true,
			});
		const disable = app.waitForEvent("window");
		await hud.getByTestId("launch-settings-button").click();
		const disableSettings = await disable;
		await expect(disableSettings.getByTestId("settings-quiet-recording")).toBeChecked();
		await disableSettings.getByTestId("settings-quiet-recording").uncheck();
		await disableSettings.getByTestId("settings-hide-after-recording").uncheck();
		await disableSettings.getByTestId("settings-hide-after-video").uncheck();
		await disableSettings.getByRole("button", { name: "Guardar", exact: true }).click();
		await expect
			.poll(() => JSON.parse(fs.readFileSync(path.join(profile, "after-recording.json"), "utf8")))
			.toEqual({ mode: "external", editorPath });
	} finally {
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
		await app.close().catch(() => undefined);
	}
});

test("direct export supports styled MP4/GIF and encoder-free original MP4", async () => {
	test.setTimeout(240_000);
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-after-recording-"));
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
			"--enable-unsafe-swiftshader",
		],
		env: environment,
	});
	const originalClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
	const exportedPaths: string[] = [];
	try {
		if (process.env.OPENSCREEN_TEST_EXECUTABLE) {
			const expectedVersion = JSON.parse(
				fs.readFileSync(path.resolve("package.json"), "utf8"),
			).version;
			expect(await app.evaluate(({ app }) => app.getVersion())).toBe(expectedVersion);
		}
		const hud = await app.firstWindow();
		await hud.waitForLoadState("domcontentloaded");
		await expect(hud.getByRole("button", { name: "Settings", exact: true })).toBeAttached({
			timeout: 30_000,
		});
		const data = await app.evaluate(({ app }) => app.getPath("userData"));
		expect(path.resolve(data)).toBe(path.resolve(profile));
		fs.writeFileSync(path.join(data, "after-recording.json"), JSON.stringify({ mode: "export" }));
		const fixture = path.join(data, "recordings", "sample.webm");
		fs.mkdirSync(path.dirname(fixture), { recursive: true });
		fs.copyFileSync(path.resolve("tests/fixtures/sample.webm"), fixture);
		await hud.evaluate(async (file) => {
			await window.electronAPI.setCurrentVideoPath(file);
		}, fixture);
		const next = app.waitForEvent("window");
		await hud
			.evaluate(() => window.electronAPI.finishRecording())
			.catch((error) => {
				if (!/closed|destroyed/i.test(String(error))) throw error;
			});
		const view = await next;
		view.on("console", (message) => {
			if (message.type() === "error") console.log(`RENDERER_ERROR=${message.text()}`);
		});
		await view.waitForLoadState("domcontentloaded");
		await expect
			.poll(
				async () => {
					try {
						return await view.evaluate(() => typeof VideoEncoder);
					} catch (error) {
						if (/Execution context was destroyed/.test(String(error))) return "reloading";
						throw error;
					}
				},
				{ timeout: 30_000 },
			)
			.toBe("function");
		expect(view.url()).toContain("exportOnly=1");
		await expect(view.getByRole("button", { name: "Export & copy path", exact: true })).toBeEnabled(
			{
				timeout: 45_000,
			},
		);
		await expect(view.getByTestId("testId-export-panel-button")).toHaveCount(0);
		await view.screenshot({ path: path.join(profile, "direct-export-desktop.png") });
		for (const format of ["mp4", "gif"]) {
			const output = path.join(profile, `export.${format}`);
			exportedPaths.push(output);
			await app.evaluate(({ ipcMain }, destination) => {
				ipcMain.removeHandler("pick-export-save-path");
				ipcMain.removeHandler("write-export-to-path");
				ipcMain.handle("pick-export-save-path", () => {
					(globalThis as Record<string, unknown>).__pickedExport = true;
					return { success: true, path: destination, canceled: false };
				});
				ipcMain.handle("write-export-to-path", (_event, buffer: ArrayBuffer, filePath: string) => {
					if (filePath !== destination) throw new Error("Unexpected export destination");
					(globalThis as Record<string, unknown>).__directExport =
						Buffer.from(buffer).toString("base64");
					return { success: true, path: filePath };
				});
				(globalThis as Record<string, unknown>).__directExport = null;
			}, output);
			await view.getByLabel("Format", { exact: true }).selectOption(format);
			await view.getByRole("button", { name: "Export & copy path", exact: true }).click();
			await expect
				.poll(
					() => app.evaluate(() => Boolean((globalThis as Record<string, unknown>).__directExport)),
					{ timeout: 90_000 },
				)
				.toBe(true);
			const encoded = await app.evaluate(
				() => (globalThis as Record<string, unknown>).__directExport as string,
			);
			const bytes = Buffer.from(encoded, "base64");
			fs.writeFileSync(output, bytes);
			expect(bytes.length).toBeGreaterThan(1024);
			if (format === "mp4") expect(bytes.subarray(4, 8).toString()).toBe("ftyp");
			else expect(bytes.subarray(0, 6).toString()).toMatch(/^GIF8[79]a/);
			await expect
				.poll(() => app.evaluate(({ clipboard }, file) => clipboard.readText() === file, output))
				.toBe(true);
			await expect(
				view.getByRole("button", { name: "Export & copy path", exact: true }),
			).toBeEnabled();
			await expect(view.getByText("Show in folder", { exact: true })).toBeVisible({
				timeout: 10_000,
			});
		}
		const originalFixture = path.join(data, "recordings", "original.mp4");
		fs.copyFileSync(path.join(profile, "export.mp4"), originalFixture);
		await view.evaluate(
			async (media) => {
				await window.electronAPI.setCurrentRecordingSession({
					screenVideoPath: media.screen,
					webcamVideoPath: media.webcam,
					cursorCaptureMode: "editable-overlay",
					createdAt: Date.now(),
				});
			},
			{ screen: originalFixture, webcam: fixture },
		);
		await view.reload({ waitUntil: "domcontentloaded" });
		await expect(view.getByRole("button", { name: "Export & copy path", exact: true })).toBeEnabled(
			{ timeout: 45_000 },
		);
		await view.getByLabel("Format", { exact: true }).selectOption("original");
		await expect(view.getByLabel("Quality", { exact: true })).toHaveCount(0);
		await expect(view.getByLabel("Frame rate", { exact: true })).toHaveCount(0);
		await expect(view.getByRole("status")).toHaveText("Not included: editable cursor, webcam");
		const originalOutput = path.join(profile, "quick-original.mp4");
		fs.writeFileSync(
			path.join(data, "after-recording.json"),
			JSON.stringify({ mode: "export", hideAfterVideo: true }),
		);
		exportedPaths.push(originalOutput);
		await app.evaluate(({ ipcMain }, destination) => {
			ipcMain.removeHandler("pick-export-save-path");
			ipcMain.handle("pick-export-save-path", () => ({ success: true, path: destination }));
			ipcMain.removeHandler("write-export-to-path");
			ipcMain.handle("write-export-to-path", () => {
				throw new Error("Original export must not use renderer video buffers");
			});
		}, originalOutput);
		await view.evaluate(() =>
			Object.defineProperty(window, "VideoEncoder", { configurable: true, value: undefined }),
		);
		await view.getByRole("button", { name: "Export & copy path", exact: true }).click();
		await expect.poll(() => fs.existsSync(originalOutput), { timeout: 30_000 }).toBe(true);
		const exportWindow = await app.browserWindow(view);
		await expect.poll(() => exportWindow.evaluate((win) => win.isVisible())).toBe(false);
		await app.evaluate(({ Tray }) => {
			const original = Tray.prototype.setContextMenu;
			Tray.prototype.setContextMenu = function (menu) {
				(globalThis as Record<string, unknown>).__testTray = this;
				original.call(this, menu);
			};
		});
		await view.evaluate(() => window.electronAPI.setLocale("en"));
		await app.evaluate(() => {
			const tray = (globalThis as Record<string, unknown>).__testTray as {
				emit: (event: string) => void;
			};
			tray.emit("click");
		});
		await expect.poll(() => exportWindow.evaluate((win) => win.isVisible())).toBe(true);
		expect(fs.readFileSync(originalOutput)).toEqual(fs.readFileSync(originalFixture));
		await expect
			.poll(() =>
				app.evaluate(({ clipboard }, file) => clipboard.readText() === file, originalOutput),
			)
			.toBe(true);
		await expect(view.getByText("Show in folder", { exact: true })).toBeVisible();
		await view.screenshot({ path: path.join(profile, "original-export-desktop.png") });
		await app.evaluate(({ ipcMain }, source) => {
			ipcMain.removeHandler("pick-export-save-path");
			ipcMain.handle("pick-export-save-path", () => ({ success: true, path: source }));
		}, originalFixture);
		await view.getByRole("button", { name: "Export & copy path", exact: true }).click();
		await expect(view.getByRole("alert")).toContainText("different destination");
		await view
			.locator("[data-sonner-toast]")
			.filter({ hasText: "different destination" })
			.getByRole("button", { name: "Close toast" })
			.click();
		await expect(
			view.locator("[data-sonner-toast]").filter({ hasText: "different destination" }),
		).toHaveCount(0);
		expect(await exportWindow.evaluate((win) => win.isVisible())).toBe(true);
		expect(fs.readFileSync(originalOutput)).toEqual(fs.readFileSync(originalFixture));
		expect(
			await app.evaluate(({ clipboard }, file) => clipboard.readText() === file, originalOutput),
		).toBe(true);
		await app.evaluate(({ ipcMain }) => {
			(globalThis as Record<string, unknown>).__cancelledExport = false;
			ipcMain.removeHandler("pick-export-save-path");
			ipcMain.handle("pick-export-save-path", () => {
				(globalThis as Record<string, unknown>).__cancelledExport = true;
				return { success: false, canceled: true };
			});
		});
		await view.getByRole("button", { name: "Export & copy path", exact: true }).click();
		await expect
			.poll(() =>
				app.evaluate(() => Boolean((globalThis as Record<string, unknown>).__cancelledExport)),
			)
			.toBe(true);
		expect(
			await app.evaluate(
				({ clipboard }, file) => clipboard.readText() === file,
				exportedPaths[exportedPaths.length - 1],
			),
		).toBe(true);
		await expect(
			view.getByRole("button", { name: "Export & copy path", exact: true }),
		).toBeEnabled();
		const compact = await app.browserWindow(view);
		await compact.evaluate((window) => window.setSize(800, 600));
		await view.screenshot({ path: path.join(profile, "direct-export-compact.png") });
		expect(await exportWindow.evaluate((win) => win.isVisible())).toBe(true);
		const pixels = await view
			.locator("canvas")
			.first()
			.evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }));
		expect(pixels.width).toBeGreaterThan(0);
		expect(pixels.height).toBeGreaterThan(0);
		const nextHud = app.waitForEvent("window");
		await view.getByRole("button", { name: "Done", exact: true }).click();
		const returnedHud = await nextHud;
		await returnedHud.waitForLoadState("domcontentloaded");
		const recorderWindow = await app.browserWindow(returnedHud);
		await expect.poll(() => recorderWindow.evaluate((win) => win.isVisible())).toBe(false);
		await app.evaluate(() => {
			const tray = (globalThis as Record<string, unknown>).__testTray as {
				emit: (event: string) => void;
			};
			tray.emit("click");
		});
		await expect.poll(() => recorderWindow.evaluate((win) => win.isVisible())).toBe(true);
		console.log(`DIRECT_EXPORT_VALIDATION=${profile}`);
	} finally {
		await app
			.evaluate(
				({ clipboard }, previous) => {
					if (previous.paths.includes(clipboard.readText())) {
						clipboard.writeText(previous.text);
					}
				},
				{ paths: exportedPaths, text: originalClipboard },
			)
			.catch(() => undefined);
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
		await app.close().catch(() => undefined);
	}
});
