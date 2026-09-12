import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("direct export skips editor chrome and exports MP4 and GIF", async () => {
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
	try {
		const hud = await app.firstWindow();
		await hud.waitForLoadState("domcontentloaded");
		await expect(hud.getByRole("button", { name: "After recording", exact: true })).toBeAttached();
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
		await expect.poll(() => view.evaluate(() => typeof VideoEncoder)).toBe("function");
		expect(view.url()).toContain("exportOnly=1");
		await expect(view.getByRole("button", { name: "Export", exact: true })).toBeEnabled({
			timeout: 45_000,
		});
		await expect(view.getByTestId("testId-export-panel-button")).toHaveCount(0);
		await view.screenshot({ path: path.join(profile, "direct-export-desktop.png") });
		for (const format of ["mp4", "gif"]) {
			const output = path.join(profile, `export.${format}`);
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
			await view.getByRole("button", { name: "Export", exact: true }).click();
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
			await expect(view.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
			await expect(view.getByText("Show in folder", { exact: true })).toBeVisible({
				timeout: 10_000,
			});
		}
		const compact = await app.browserWindow(view);
		await compact.evaluate((window) => window.setSize(800, 600));
		await view.screenshot({ path: path.join(profile, "direct-export-compact.png") });
		const pixels = await view
			.locator("canvas")
			.first()
			.evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }));
		expect(pixels.width).toBeGreaterThan(0);
		expect(pixels.height).toBeGreaterThan(0);
		console.log(`DIRECT_EXPORT_VALIDATION=${profile}`);
	} finally {
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
		await app.close().catch(() => undefined);
	}
});
