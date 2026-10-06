import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("audible sidecar plays continuously without repeated synchronization seeks", async () => {
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-continuous-audio-"));
	const projectPath = path.join(profile, "playback.openscreen");
	if (process.env.OPENSCREEN_TEST_PROJECT) {
		const project = JSON.parse(fs.readFileSync(process.env.OPENSCREEN_TEST_PROJECT, "utf8"));
		const linked = new Map<string, string>();
		for (const key of ["screenVideoPath", "webcamVideoPath", "microphoneAudioPath"]) {
			const source = project.media[key];
			if (!source) continue;
			if (!linked.has(source)) {
				const destination = path.join(profile, path.basename(source));
				fs.linkSync(source, destination);
				linked.set(source, destination);
			}
			project.media[key] = linked.get(source);
		}
		fs.writeFileSync(projectPath, JSON.stringify(project));
	} else {
		const screen = path.join(profile, "screen.mp4");
		const webcam = path.join(profile, "camera.webm");
		for (const [file, codec] of [
			[screen, "libx264"],
			[webcam, "libvpx"],
		]) {
			execFileSync(
				"ffmpeg",
				[
					"-v",
					"error",
					"-f",
					"lavfi",
					"-i",
					"testsrc2=size=320x240:rate=30",
					"-f",
					"lavfi",
					"-i",
					"sine=frequency=440:sample_rate=48000",
					"-t",
					"20",
					"-c:v",
					codec,
					"-c:a",
					file === webcam ? "libopus" : "aac",
					file,
				],
				{ windowsHide: true },
			);
		}
		fs.writeFileSync(
			projectPath,
			JSON.stringify({
				version: 2,
				media: {
					screenVideoPath: screen,
					webcamVideoPath: webcam,
					microphoneAudioPath: webcam,
					webcamOffsetMs: 0,
					microphoneOffsetMs: 0,
				},
				editor: { zoomRegions: [], trimRegions: [], speedRegions: [] },
			}),
		);
	}
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
			"--autoplay-policy=no-user-gesture-required",
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
		const play = editor.getByRole("button", { name: "Play", exact: true });
		await expect(play).toBeVisible({ timeout: 30_000 });
		const screenPlayer = editor.locator('video[src*=".mp4"]').first();
		await expect
			.poll(() => screenPlayer.evaluate((video: HTMLVideoElement) => video.readyState), {
				timeout: 30_000,
			})
			.toBeGreaterThanOrEqual(2);
		await expect(editor.locator("canvas").first()).toBeVisible();
		await editor.waitForTimeout(2000);
		await editor.evaluate(() => {
			const camera = document.querySelector('video[src*=".webm"]') as HTMLVideoElement;
			const screen = document.querySelector('video[src*=".mp4"]') as HTMLVideoElement;
			const trace: unknown[] = [];
			(window as unknown as { audioTrace: unknown[] }).audioTrace = trace;
			const descriptor = Object.getOwnPropertyDescriptor(
				HTMLMediaElement.prototype,
				"currentTime",
			)!;
			Object.defineProperty(camera, "currentTime", {
				configurable: true,
				get: () => descriptor.get!.call(camera),
				set: (value) => {
					trace.push({
						event: "audio-seek",
						value,
						screenTime: screen.currentTime,
						cameraTime: descriptor.get!.call(camera),
						screenPaused: screen.paused,
						cameraPaused: camera.paused,
					});
					descriptor.set!.call(camera, value);
				},
			});
			for (const event of ["waiting", "playing", "pause", "seeking"])
				screen.addEventListener(event, () =>
					trace.push({ event, screenTime: screen.currentTime, cameraTime: camera.currentTime }),
				);
			(window as unknown as { audioSeeks: number }).audioSeeks = 0;
			camera.addEventListener(
				"seeking",
				() => (window as unknown as { audioSeeks: number }).audioSeeks++,
			);
		});
		await play.click();
		await expect
			.poll(() => screenPlayer.evaluate((video: HTMLVideoElement) => video.currentTime))
			.toBeGreaterThan(2);
		await editor.evaluate(() => {
			(window as unknown as { audioSeeks: number }).audioSeeks = 0;
		});
		await editor.waitForTimeout(10_000);
		const result = await editor.evaluate(() => {
			const screen = document.querySelector('video[src*=".mp4"]') as HTMLVideoElement;
			const camera = document.querySelector('video[src*=".webm"]') as HTMLVideoElement;
			return {
				seeks: (window as unknown as { audioSeeks: number }).audioSeeks,
				screenTime: screen.currentTime,
				cameraTime: camera.currentTime,
				muted: camera.muted,
				paused: camera.paused,
				trace: (window as unknown as { audioTrace: unknown[] }).audioTrace,
			};
		});
		console.log("CONTINUOUS_AUDIO_PLAYBACK", JSON.stringify({ profile, ...result }));
		expect(result.paused).toBe(false);
		expect(result.muted).toBe(false);
		expect(result.screenTime).toBeGreaterThan(8);
		expect(Math.abs(result.screenTime - result.cameraTime)).toBeLessThan(0.1);
		expect(result.seeks).toBe(0);
		await editor.getByRole("button", { name: "Pause", exact: true }).click();
		await expect
			.poll(() =>
				editor.locator('video[src*=".webm"]').evaluate((video: HTMLVideoElement) => video.paused),
			)
			.toBe(true);
		await screenPlayer.evaluate((video: HTMLVideoElement) => {
			video.currentTime = 5;
		});
		await expect
			.poll(() =>
				editor.evaluate(() => {
					const screen = document.querySelector('video[src*=".mp4"]') as HTMLVideoElement;
					const camera = document.querySelector('video[src*=".webm"]') as HTMLVideoElement;
					return Math.abs(screen.currentTime - camera.currentTime);
				}),
			)
			.toBeLessThan(0.05);
		await play.click();
		await expect
			.poll(() => screenPlayer.evaluate((video: HTMLVideoElement) => video.currentTime))
			.toBeGreaterThan(6);
		await editor.evaluate(() => {
			(window as unknown as { audioSeeks: number }).audioSeeks = 0;
		});
		await editor.waitForTimeout(3000);
		expect(
			await editor.evaluate(() => (window as unknown as { audioSeeks: number }).audioSeeks),
		).toBe(0);
	} finally {
		await app
			.evaluate(({ app }) => {
				setTimeout(() => app.quit(), 0);
			})
			.catch(() => undefined);
		await app.close().catch(() => undefined);
	}
});
