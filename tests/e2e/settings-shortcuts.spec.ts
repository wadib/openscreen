import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("Settings edits, persists and validates Openscreen shortcuts", async () => {
	test.setTimeout(180_000);
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-settings-shortcuts-"));
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
		const hud = await app.firstWindow();
		await expect(hud.getByTestId("launch-settings-button")).toBeAttached({ timeout: 30_000 });
		const open = async () => {
			const next = app.waitForEvent("window");
			await hud.getByTestId("launch-settings-button").click();
			const settings = await next;
			await expect(settings.getByTestId("settings-language")).toBeEnabled({ timeout: 30_000 });
			await settings.getByRole("tab", { name: "Keyboard Shortcuts", exact: true }).click();
			await expect(settings.getByTestId("shortcut-openApp")).toBeEnabled();
			return settings;
		};
		let settings = await open();
		await settings.getByTestId("shortcut-addZoom").click();
		await settings.keyboard.press("q");
		await expect(settings.getByTestId("shortcut-addZoom")).toHaveText("Q");
		await settings.getByRole("tab", { name: "General", exact: true }).click();
		await settings.getByRole("tab", { name: "Keyboard Shortcuts", exact: true }).click();
		await expect(settings.getByTestId("shortcut-addZoom")).toHaveText("Q");
		await settings.getByTestId("shortcut-addZoom").click();
		await settings.keyboard.press("Escape");
		await expect(settings.getByTestId("shortcut-addZoom")).toHaveText("Q");
		await expect(settings.getByRole("tab", { name: "General", exact: true })).toBeVisible();
		await settings.getByTestId("shortcut-addZoom").click();
		await settings.keyboard.press("t");
		await expect(settings.getByText("Already used by Add Trim", { exact: false })).toBeVisible();
		await settings.getByRole("button", { name: "Swap", exact: true }).click();
		await expect(settings.getByTestId("shortcut-addZoom")).toHaveText("T");
		await expect(settings.getByTestId("shortcut-addTrim")).toHaveText("Q");
		await settings.getByTestId("shortcut-openApp").click();
		await settings.keyboard.press("Control+Shift+F10");
		await settings.getByRole("button", { name: "Save", exact: true }).click();
		await expect.poll(() => fs.existsSync(path.join(profile, "shortcuts.json"))).toBe(true);
		const saved = JSON.parse(fs.readFileSync(path.join(profile, "shortcuts.json"), "utf8"));
		expect(saved.addZoom).toEqual({ key: "t" });
		expect(saved.addTrim).toEqual({ key: "q" });
		expect(saved.openApp).toEqual({ key: "f10", ctrl: true, shift: true });
		expect(
			await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered("Control+Shift+F10")),
		).toBe(true);

		settings = await open();
		await expect(settings.getByTestId("shortcut-addZoom")).toHaveText("T");
		await app.evaluate(({ globalShortcut }) => {
			if (
				!globalShortcut.register("Control+Shift+F11", () => {
					/* Reserve without executing an app action. */
				})
			)
				throw new Error("Cannot reserve test shortcut");
		});
		await settings.getByTestId("shortcut-openApp").click();
		await settings.keyboard.press("Control+Shift+F11");
		await settings.getByRole("button", { name: "Save", exact: true }).click();
		await expect(settings.getByRole("alert")).toContainText("Failed to register shortcut");
		expect(JSON.parse(fs.readFileSync(path.join(profile, "shortcuts.json"), "utf8"))).toEqual(
			saved,
		);
		expect(
			await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered("Control+Shift+F10")),
		).toBe(true);
		await settings.getByRole("button", { name: "Cancel", exact: true }).click();

		settings = await open();
		await settings.getByRole("button", { name: "Reset to defaults", exact: true }).click();
		await expect(settings.getByTestId("shortcut-addZoom")).toHaveText("Z");
		await settings.getByRole("button", { name: "Cancel", exact: true }).click();
		expect(JSON.parse(fs.readFileSync(path.join(profile, "shortcuts.json"), "utf8"))).toEqual(
			saved,
		);

		settings = await open();
		await expect(settings.getByTestId("shortcut-addZoom")).toHaveText("T");
		const win = await app.browserWindow(settings);
		await win.evaluate((window) => window.show());
		await settings.screenshot({ path: path.join(profile, "settings-shortcuts.png") });
		const fit = await settings.evaluate(() =>
			Array.from(document.querySelectorAll("button"))
				.filter((button) => button.getBoundingClientRect().height > 0)
				.every((button) => button.scrollWidth <= button.clientWidth + 1),
		);
		expect(fit).toBe(true);
		await settings.getByRole("button", { name: "Cancel", exact: true }).click();
		console.log(`SETTINGS_SHORTCUTS_VALIDATION=${profile}`);
	} finally {
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
		await app.close().catch(() => undefined);
	}
});
