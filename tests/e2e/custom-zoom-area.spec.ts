import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("custom zoom area resizes independently, survives undo, and reloads from disk", async () => {
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-zoom-area-"));
	const video = path.join(profile, "source.mp4");
	const projectPath = path.join(profile, "area.openscreen");
	execFileSync(
		"ffmpeg",
		[
			"-v",
			"error",
			"-f",
			"lavfi",
			"-i",
			"color=c=0x20a060:s=640x360:r=30",
			"-t",
			"10",
			"-c:v",
			"libx264",
			video,
		],
		{ windowsHide: true },
	);
	fs.writeFileSync(
		projectPath,
		JSON.stringify({
			version: 2,
			media: { screenVideoPath: video },
			editor: {
				wallpaper: "#102030",
				padding: 0,
				shadowIntensity: 0,
				borderRadius: 0,
				zoomRegions: [],
				trimRegions: [],
				speedRegions: [],
				aspectRatio: "16:9",
			},
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
		const hud = await app.firstWindow();
		await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30_000 });
		expect(
			await hud.evaluate((file) => window.electronAPI.loadProjectFileFromPath(file), projectPath),
		).toMatchObject({ success: true });
		const opened = app.waitForEvent("window");
		await hud
			.evaluate(() => window.electronAPI.switchToEditor())
			.catch((error) => {
				if (!/closed|destroyed/i.test(String(error))) throw error;
			});
		const editor = await opened;
		await expect(editor.getByRole("button", { name: "Play", exact: true })).toBeVisible({
			timeout: 30_000,
		});
		await expect(editor.locator("canvas").first()).toBeVisible();
		const screenPlayer = editor.locator('video[src*="source.mp4"]').first();
		await expect
			.poll(() => screenPlayer.evaluate((node) => (node as HTMLVideoElement).readyState))
			.toBeGreaterThanOrEqual(2);
		await editor.waitForTimeout(2000);
		await editor.getByRole("button", { name: "Add Zoom (Z)", exact: true }).click();
		await editor.getByRole("switch", { name: "Custom area", exact: true }).click();
		const width = editor.getByTestId("zoom-area-width");
		const height = editor.getByTestId("zoom-area-height");
		await width.fill("60");
		await width.press("Enter");
		await height.fill("20");
		await height.press("Enter");
		await expect(width).toHaveValue("60");
		await expect(height).toHaveValue("20");
		await editor.getByRole("button", { name: "Save Project", exact: true }).click();
		await expect
			.poll(() => JSON.parse(fs.readFileSync(projectPath, "utf8")).editor.zoomRegions[0]?.area)
			.toEqual({ width: 0.6, height: 0.2, fit: "fit" });
		console.log(
			"CUSTOM_AREA_BEFORE_PREVIEW",
			JSON.parse(fs.readFileSync(projectPath, "utf8")).editor.zoomRegions,
		);
		const area = editor.getByTestId("zoom-area-selection");
		await expect(area).toBeVisible();
		const before = await area.boundingBox();
		const handle = await area.locator(".zoom-area-resize-right").boundingBox();
		expect(handle).not.toBeNull();
		await editor.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
		await editor.mouse.down();
		await editor.mouse.move(handle!.x + handle!.width / 2 + 40, handle!.y + handle!.height / 2, {
			steps: 10,
		});
		await editor.mouse.up();
		const after = await area.boundingBox();
		expect(after!.width).toBeGreaterThan(before!.width + 20);
		expect(Math.abs(after!.height - before!.height)).toBeLessThan(2);
		await expect(height).toHaveValue("20");
		await editor.keyboard.press("Control+z");
		await expect(width).toHaveValue("60");
		await editor.keyboard.press("Control+Shift+z");
		await expect.poll(() => width.inputValue()).not.toBe("60");
		await width.fill("60");
		await width.press("Enter");
		await screenPlayer.evaluate(
			(node) =>
				new Promise<void>((resolve) => {
					const video = node as HTMLVideoElement;
					video.addEventListener("seeked", () => resolve(), { once: true });
					video.currentTime = 0.7;
				}),
		);
		await editor.waitForTimeout(500);
		const hold = editor.getByRole("button", { name: "Hold to preview zoom effect", exact: true });
		const holdBounds = await hold.boundingBox();
		await editor.mouse.move(
			holdBounds!.x + holdBounds!.width / 2,
			holdBounds!.y + holdBounds!.height / 2,
		);
		await editor.mouse.down();
		await expect(area).toBeHidden();
		await editor.waitForTimeout(500);
		console.log(
			"CUSTOM_AREA_PREVIEW_TIME",
			await editor
				.locator('video[src*="source.mp4"]')
				.first()
				.evaluate((node) => ({
					time: (node as HTMLVideoElement).currentTime,
					paused: (node as HTMLVideoElement).paused,
				})),
		);
		const canvasBounds = await editor.locator("canvas").first().boundingBox();
		expect(canvasBounds).not.toBeNull();
		const preview = await editor.screenshot({
			path: path.join(profile, "custom-area-held.png"),
		});
		await editor.mouse.up();
		await hold.focus();
		await editor.keyboard.down("Space");
		await expect(area).toBeHidden();
		expect(
			await editor
				.locator('video[src*="source.mp4"]')
				.first()
				.evaluate((node) => (node as HTMLVideoElement).paused),
		).toBe(true);
		await editor.keyboard.up("Space");
		await expect(area).toBeVisible();
		const previewWidth = preview.readUInt32BE(16);
		const previewHeight = preview.readUInt32BE(20);
		const pixels = execFileSync(
			"ffmpeg",
			[
				"-v",
				"error",
				"-i",
				path.join(profile, "custom-area-held.png"),
				"-frames:v",
				"1",
				"-f",
				"rawvideo",
				"-pix_fmt",
				"rgba",
				"pipe:1",
			],
			{
				windowsHide: true,
				maxBuffer: 16 * 1024 * 1024,
				timeout: 10_000,
			},
		);
		const pixel = (x: number, y: number) => {
			const px = Math.floor(canvasBounds!.x + x * canvasBounds!.width);
			const py = Math.floor(canvasBounds!.y + y * canvasBounds!.height);
			expect(py).toBeLessThan(previewHeight);
			return Array.from(
				pixels.subarray((py * previewWidth + px) * 4, (py * previewWidth + px) * 4 + 3),
			);
		};
		const band = pixel(0.5, 0.1);
		for (const [index, expected] of [16, 32, 48].entries())
			expect(Math.abs(band[index] - expected)).toBeLessThan(8);
		const content = pixel(0.5, 0.5);
		expect(content[1]).toBeGreaterThan(120);
		expect(content[0]).toBeLessThan(60);
		await editor.getByText("Fill", { exact: true }).click();
		await editor.getByRole("button", { name: "Save Project", exact: true }).click();
		await expect
			.poll(() => JSON.parse(fs.readFileSync(projectPath, "utf8")).editor.zoomRegions[0]?.area)
			.toEqual({ width: 0.6, height: 0.2, fit: "fill" });
		await editor.screenshot({ path: path.join(profile, "custom-area-controls.png") });
		const zoomId = JSON.parse(fs.readFileSync(projectPath, "utf8")).editor.zoomRegions[0].id;
		await editor.reload();
		await expect(editor.getByRole("button", { name: "Play", exact: true })).toBeVisible({
			timeout: 30_000,
		});
		await editor.locator(`[data-timeline-item-id="${zoomId}"]`).click();
		await expect(width).toHaveValue("60");
		await expect(height).toHaveValue("20");
		await expect(editor.getByRole("radio", { name: "Fill", exact: true })).toBeChecked();
		await editor.screenshot({ path: path.join(profile, "custom-area-reopened.png") });
		const editorWindow = await app.browserWindow(editor);
		await editorWindow.evaluate((window) => {
			window.unmaximize();
			window.setSize(1000, 720);
		});
		await editor.waitForTimeout(500);
		await width.scrollIntoViewIfNeeded();
		await height.scrollIntoViewIfNeeded();
		await expect(width).toBeVisible();
		await expect(height).toBeVisible();
		expect((await width.boundingBox())!.x + (await width.boundingBox())!.width).toBeLessThanOrEqual(
			await editor.evaluate(() => innerWidth),
		);
		await editor.screenshot({ path: path.join(profile, "custom-area-compact.png") });
		console.log("CUSTOM_ZOOM_AREA_VALIDATION", profile);
	} catch (error) {
		console.log("CUSTOM_ZOOM_AREA_FAILURE", profile, String(error));
		throw error;
	} finally {
		// The fixture owns this process and only generated media; no recording is active.
		const process = app.process();
		if (process.exitCode === null) {
			const exited = new Promise<void>((resolve) => process.once("exit", () => resolve()));
			process.kill("SIGTERM");
			await exited;
		}
	}
});
