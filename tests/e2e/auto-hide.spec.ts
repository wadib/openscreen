import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

for (const mode of ["editor", "export"] as const) {
	for (const hideAfterRecording of [false, true]) {
		test(`${mode} respects hide after recording: ${hideAfterRecording}`, async () => {
			test.setTimeout(90_000);
			const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-auto-hide-"));
			const env = { ...process.env, HEADLESS: "false" };
			delete env.ELECTRON_RUN_AS_NODE;
			if (process.env.OPENSCREEN_TEST_EXECUTABLE) delete env.VITE_DEV_SERVER_URL;
			const app = await electron.launch({
				...(process.env.OPENSCREEN_TEST_EXECUTABLE
					? { executablePath: process.env.OPENSCREEN_TEST_EXECUTABLE }
					: {}),
				args: [
					...(process.env.OPENSCREEN_TEST_EXECUTABLE
						? []
						: [path.resolve("dist-electron/main.js")]),
					`--user-data-dir=${profile}`,
					"--no-sandbox",
				],
				env,
			});
			try {
				const hud = await app.firstWindow();
				await expect(hud.getByTestId("launch-settings-button")).toBeVisible({ timeout: 30_000 });
				await app.evaluate(({ Tray }) => {
					const original = Tray.prototype.setContextMenu;
					Tray.prototype.setContextMenu = function (menu) {
						(globalThis as Record<string, unknown>).__testTray = this;
						(globalThis as Record<string, unknown>).__testTrayMenu = menu;
						original.call(this, menu);
					};
				});
				await hud.evaluate(() => window.electronAPI.setLocale("en"));
				fs.writeFileSync(
					path.join(profile, "after-recording.json"),
					JSON.stringify({
						mode,
						hideAfterRecording,
						hideAfterVideo: true,
					}),
				);
				const fixture = path.join(profile, "recordings", "sample.webm");
				fs.mkdirSync(path.dirname(fixture), { recursive: true });
				fs.copyFileSync(path.resolve("tests/fixtures/sample.webm"), fixture);
				expect(
					await hud.evaluate((file) => window.electronAPI.setCurrentVideoPath(file), fixture),
				).toMatchObject({ success: true });
				const next = app.waitForEvent("window");
				await hud
					.evaluate(() => window.electronAPI.finishRecording())
					.catch((error) => {
						if (!/closed|destroyed/i.test(String(error))) throw error;
					});
				const view = await next;
				await view.waitForLoadState("domcontentloaded");
				await expect(view.locator("video").first()).toBeAttached({ timeout: 45_000 });
				const win = await app.browserWindow(view);
				await expect
					.poll(() => win.evaluate((window) => window.isVisible()))
					.toBe(!hideAfterRecording);
				const reopen = () =>
					app.evaluate(() => {
						const tray = (globalThis as Record<string, unknown>).__testTray as {
							emit: (event: string) => void;
						};
						tray.emit("click");
					});
				await reopen();
				await expect.poll(() => win.evaluate((window) => window.isVisible())).toBe(true);
				await expect(
					view.evaluate(() => window.electronAPI.recordingVideoSaved("relative.mp4")),
				).rejects.toThrow("Saved video path required");
				await expect(
					view.evaluate(
						(file) => window.electronAPI.recordingVideoSaved(file),
						path.join(profile, "missing.mp4"),
					),
				).rejects.toThrow();
				expect(await win.evaluate((window) => window.isVisible())).toBe(true);
				if (mode === "editor") {
					await view.evaluate(() => window.electronAPI.setHasUnsavedChanges(true));
					await win.evaluate((window) => window.close());
					await expect(view.getByRole("dialog")).toBeVisible();
					expect(await win.evaluate((window) => window.isVisible())).toBe(true);
					await view.getByRole("button", { name: "Cancel", exact: true }).click();
					expect(await win.evaluate((window) => window.isVisible())).toBe(true);
					await win.evaluate((window) => window.close());
					await view.getByRole("button", { name: "Discard & Close", exact: true }).click();
				} else {
					await win.evaluate((window) => window.close());
				}
				await expect.poll(() => win.evaluate((window) => window.isVisible())).toBe(false);
				await reopen();
				await expect.poll(() => win.evaluate((window) => window.isVisible())).toBe(true);
				await view.evaluate(() => window.electronAPI.setHasUnsavedChanges(false));
				await view.evaluate((file) => window.electronAPI.recordingVideoSaved(file), fixture);
				await expect.poll(() => win.evaluate((window) => window.isVisible())).toBe(false);
				const closed = app.waitForEvent("close");
				await app
					.evaluate(() => {
						const menu = (globalThis as Record<string, unknown>).__testTrayMenu as {
							items: { label: string; click: () => void }[];
						};
						const quit = menu.items.find((item) => item.label === "Quit");
						if (!quit) throw new Error("Tray Quit is missing");
						quit.click();
					})
					.catch((error) => {
						if (!/closed|destroyed/i.test(String(error))) throw error;
					});
				await closed;
			} finally {
				await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
				await app.close().catch(() => undefined);
			}
		});
	}
}
