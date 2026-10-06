import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { CAMERA_CONTROL_IDS } from "../../src/lib/cameraControls";

test("camera controls fit the native HUD and remain scrollable in both tray layouts", async () => {
	test.skip(process.platform !== "win32");
	test.setTimeout(120_000);
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-camera-controls-"));
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
			"--use-fake-device-for-media-stream",
			"--use-fake-ui-for-media-stream",
		],
		env,
	});
	try {
		const hud = await app.firstWindow();
		await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30_000 });
		await app.evaluate(
			({ ipcMain }, ids) => {
				const controls = ids.map((id) => ({
					id,
					label: id,
					min: 0,
					max: 100,
					step: 1,
					defaultValue: 50,
					value: 50,
					autoSupported: true,
					manualSupported: true,
					automatic: false,
				}));
				ipcMain.removeHandler("get-camera-controls");
				ipcMain.handle("get-camera-controls", () => ({ success: true, controls }));
				ipcMain.removeHandler("set-camera-control");
				ipcMain.handle("set-camera-control", (_event, request) => ({
					success: true,
					control: { ...controls.find((item) => item.id === request.property), ...request },
				}));
			},
			[...CAMERA_CONTROL_IDS],
		);
		for (const id of ["launch-microphone-button", "launch-webcam-button"]) {
			if ((await hud.getByTestId(id).getAttribute("title"))?.startsWith("Enable"))
				await hud.getByTestId(id).click();
		}
		await expect
			.poll(() =>
				hud.evaluate(
					() =>
						JSON.parse(localStorage.getItem("openscreen_recording_preferences_v1") ?? "{}")
							.webcamDeviceName,
				),
			)
			.toBe("fake_device_0");
		await hud.getByTestId("launch-webcam-device-selector").locator("select").focus();
		await hud.getByTestId("launch-camera-controls-button").focus();
		await hud.getByTestId("launch-camera-controls-button").press("Enter");
		const panel = hud.getByTestId("camera-controls-panel");
		for (const layout of ["horizontal", "vertical"]) {
			if (layout === "vertical") {
				await hud.getByTestId("launch-tray-layout-button").focus();
				await hud.getByTestId("launch-tray-layout-button").press("Enter");
			}
			await expect(panel).toBeVisible();
			await expect(panel.getByRole("slider")).toHaveCount(CAMERA_CONTROL_IDS.length);
			await expect
				.poll(() =>
					panel.evaluate((element) => {
						const bounds = element.getBoundingClientRect();
						return {
							bounds: bounds.toJSON(),
							width: window.innerWidth,
							height: window.innerHeight,
							inside:
								bounds.top >= 0 &&
								bounds.left >= 0 &&
								bounds.bottom <= window.innerHeight &&
								bounds.right <= window.innerWidth,
						};
					}),
				)
				.toMatchObject({ inside: true });
			const scroll = hud.getByTestId("camera-controls-scroll");
			await expect
				.poll(() => scroll.evaluate((element) => element.scrollHeight > element.clientHeight))
				.toBe(true);
			await panel.getByRole("slider", { name: "focus", exact: true }).scrollIntoViewIfNeeded();
			expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
			await hud.screenshot({ path: path.join(profile, `camera-controls-${layout}.png`) });
		}
		// A short display must reduce the scroll area, not cut off the panel header or footer.
		await hud.evaluate(() =>
			Object.defineProperty(window.screen, "availHeight", { value: 640, configurable: true }),
		);
		await hud.getByTestId("launch-tray-layout-button").click();
		await hud.getByTestId("launch-tray-layout-button").click();
		await expect
			.poll(() => panel.evaluate((element) => element.getBoundingClientRect().top >= 0))
			.toBe(true);
		await expect.poll(() => hud.evaluate(() => window.innerHeight)).toBeLessThanOrEqual(640);
		await panel.getByRole("slider", { name: "focus", exact: true }).scrollIntoViewIfNeeded();
		await hud.screenshot({ path: path.join(profile, "camera-controls-short-display.png") });
		console.log(`CAMERA_CONTROLS_VALIDATION=${profile}`);
	} finally {
		await app
			.evaluate(({ app }) => {
				setTimeout(() => app.quit(), 0);
			})
			.catch(() => undefined);
		await app.close().catch(() => undefined);
	}
});
