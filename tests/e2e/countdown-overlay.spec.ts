import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("countdown renders on first show, updates and hides before capture", async () => {
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-countdown-"));
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
		const hudWindow = await app.browserWindow(hud);
		const displays = await app.evaluate(({ screen }) =>
			screen.getAllDisplays().map((display) => ({
				id: display.id,
				bounds: display.bounds,
			})),
		);
		const target = displays[displays.length - 1];
		await hudWindow.evaluate(
			(window, area) => window.setPosition(area.x + 20, area.y + 20),
			displays[0].bounds,
		);
		const sources = await hud.evaluate(() =>
			window.electronAPI.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } }),
		);
		const selected = sources.find((source) => Number(source.display_id) === target.id);
		expect(selected).toBeTruthy();
		await hud.evaluate((source) => window.electronAPI.selectSource(source), selected!);
		const next = app.waitForEvent("window");
		const show = hud.evaluate(() => window.electronAPI.showCountdownOverlay(3, 1));
		const overlay = await next;
		await show;
		const win = await app.browserWindow(overlay);
		expect(await win.evaluate((window) => window.isVisible())).toBe(true);
		const bounds = await win.evaluate((window) => window.getBounds());
		expect(
			Math.abs(bounds.x + bounds.width / 2 - (target.bounds.x + target.bounds.width / 2)),
		).toBeLessThanOrEqual(1);
		expect(
			Math.abs(bounds.y + bounds.height / 2 - (target.bounds.y + target.bounds.height / 2)),
		).toBeLessThanOrEqual(1);
		expect(await win.evaluate((window) => window.isAlwaysOnTop())).toBe(true);
		for (const value of [3, 2, 1]) {
			if (value !== 3)
				await hud.evaluate((n) => window.electronAPI.setCountdownOverlayValue(n, 1), value);
			await expect(overlay.getByText(String(value), { exact: true })).toBeVisible();
			await overlay.screenshot({ path: path.join(profile, `countdown-${value}.png`) });
		}
		await hud.evaluate(() => window.electronAPI.hideCountdownOverlay(1));
		expect(await win.evaluate((window) => window.isVisible())).toBe(false);
		await hud.evaluate(() => window.electronAPI.showCountdownOverlay(3, 2));
		await expect(overlay.getByText("3", { exact: true })).toBeVisible();
		expect(
			await overlay.evaluate(() => {
				let latest: number | null = null;
				const unsubscribe = window.electronAPI.onCountdownOverlayValue((value) => {
					latest = value;
				});
				unsubscribe();
				return latest;
			}),
		).toBe(3);
		await hud.evaluate(() => window.electronAPI.hideCountdownOverlay(2));
		const targetId = await app.evaluate(async ({ BrowserWindow }, area) => {
			const window = new BrowserWindow({
				x: area.x + 40,
				y: area.y + 40,
				width: 640,
				height: 360,
				frame: false,
				show: false,
				title: "Countdown recording target",
			});
			await window.loadURL(
				"data:text/html,<title>Countdown recording target</title><body>Countdown target</body>",
			);
			window.showInactive();
			return window.id;
		}, target.bounds);
		const windows = await hud.evaluate(() =>
			window.electronAPI.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 } }),
		);
		const windowSource = windows.find((source) => source.name === "Countdown recording target");
		expect(windowSource).toBeTruthy();
		await hud.evaluate((source) => window.electronAPI.selectSource(source), windowSource!);
		for (const runId of [3, 4]) {
			const targetBounds = await app.evaluate(({ BrowserWindow }, id) => {
				const window = BrowserWindow.fromId(id)!;
				const bounds = window.getBounds();
				window.setBounds({
					x: bounds.x + 20,
					y: bounds.y + 20,
					width: bounds.width + 40,
					height: bounds.height + 20,
				});
				return window.getBounds();
			}, targetId);
			await hud.evaluate((id) => window.electronAPI.showCountdownOverlay(3, id), runId);
			const actual = await win.evaluate((window) => window.getBounds());
			expect(
				Math.abs(actual.x + actual.width / 2 - (targetBounds.x + targetBounds.width / 2)),
			).toBeLessThanOrEqual(1);
			expect(
				Math.abs(actual.y + actual.height / 2 - (targetBounds.y + targetBounds.height / 2)),
			).toBeLessThanOrEqual(1);
			await expect(overlay.getByText("3", { exact: true })).toBeVisible();
			await hud.evaluate((id) => window.electronAPI.hideCountdownOverlay(id), runId);
		}
		await hud.evaluate(() => window.electronAPI.showCountdownOverlay(3, 5));
		const movedTargetBounds = await app.evaluate(({ BrowserWindow }, id) => {
			const window = BrowserWindow.fromId(id)!;
			const bounds = window.getBounds();
			window.setPosition(bounds.x + 80, bounds.y + 60);
			return window.getBounds();
		}, targetId);
		await hud.evaluate(() => window.electronAPI.setCountdownOverlayValue(2, 5));
		const movedOverlayBounds = await win.evaluate((window) => window.getBounds());
		expect(
			Math.abs(
				movedOverlayBounds.x +
					movedOverlayBounds.width / 2 -
					(movedTargetBounds.x + movedTargetBounds.width / 2),
			),
		).toBeLessThanOrEqual(1);
		expect(
			Math.abs(
				movedOverlayBounds.y +
					movedOverlayBounds.height / 2 -
					(movedTargetBounds.y + movedTargetBounds.height / 2),
			),
		).toBeLessThanOrEqual(1);
		await expect(overlay.getByText("2", { exact: true })).toBeVisible();
		await hud.evaluate(() => window.electronAPI.hideCountdownOverlay(5));
		console.log(`COUNTDOWN_VALIDATION=${profile}`);
	} finally {
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
		await app.close().catch(() => undefined);
	}
});
