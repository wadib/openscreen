import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { isUpdateCheckEnabled } from "../../electron/update-checker";
import { STUDIO_MCP_VERSION, STUDIO_TOOLS } from "../../src/lib/studioMcpContract";

const appVersion = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"))
	.version as string;

test("Settings shows Help and current app and MCP versions", async () => {
	test.setTimeout(120_000);
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-settings-help-about-"));
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
		const next = app.waitForEvent("window");
		await hud.getByTestId("launch-settings-button").click();
		const settings = await next;
		await settings.getByRole("tab", { name: "Help", exact: true }).click();
		await expect(settings.getByRole("button", { name: "Quick start", exact: true })).toBeVisible();
		await expect(
			settings.getByText("Choose a full screen or application window", { exact: false }),
		).toBeVisible();
		await expect(
			settings.getByRole("button", { name: "Recording setup and controls" }),
		).toBeVisible();
		await expect(settings.getByRole("button", { name: "Pause, resume and stop" })).toBeVisible();
		await expect(settings.getByRole("button", { name: "Live blur and Studio blur" })).toBeVisible();
		await settings.getByRole("button", { name: "Studio MCP for AI agents" }).click();
		await expect(
			settings.getByText(`Studio MCP ${STUDIO_MCP_VERSION}`, { exact: false }),
		).toContainText(`${STUDIO_TOOLS.length} local Studio tools`);
		await expect(settings.getByText("studio_export", { exact: false })).toBeVisible();
		await settings.screenshot({ path: path.join(profile, "settings-help.png") });

		await settings.getByRole("tab", { name: "About", exact: true }).click();
		await expect(settings.getByTestId("about-version")).toHaveText(appVersion);
		await expect(settings.getByTestId("about-mcp-version")).toContainText(STUDIO_MCP_VERSION);
		await expect(settings.getByTestId("about-mcp-version")).toContainText(
			`${STUDIO_TOOLS.length} tools`,
		);
		await expect(settings.getByText("Capture engine", { exact: true })).toBeVisible();
		await expect(settings.getByText("Blurry", { exact: true })).toBeVisible();
		if (isUpdateCheckEnabled(appVersion)) {
			await expect(settings.getByRole("button", { name: "Check for updates" })).toBeEnabled();
		} else {
			await expect(settings.getByRole("button", { name: "Check for updates" })).toHaveCount(0);
		}
		const contentFits = await settings.evaluate(() =>
			Array.from(document.querySelectorAll("body *"))
				.filter((element) => element.getBoundingClientRect().height > 0)
				.every((element) => element.scrollWidth <= element.clientWidth + 1),
		);
		expect(contentFits).toBe(true);
		await settings.screenshot({ path: path.join(profile, "settings-about.png") });
		console.log(`SETTINGS_HELP_ABOUT_VALIDATION=${profile}`);
	} finally {
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
		await app.close().catch(() => undefined);
	}
});
