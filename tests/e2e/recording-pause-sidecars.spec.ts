import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("Windows camera and microphone share a clock through three recording pauses", async () => {
	test.skip(process.platform !== "win32");
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-pause-sidecars-"));
	fs.writeFileSync(
		path.join(profile, "after-recording.json"),
		JSON.stringify({ mode: "editor", quietRecording: false }),
	);
	const env = { ...process.env, HEADLESS: "false" };
	delete env.ELECTRON_RUN_AS_NODE;
	if (process.env.OPENSCREEN_TEST_EXECUTABLE) {
		delete env.VITE_DEV_SERVER_URL;
		delete env.OPENSCREEN_WGC_CAPTURE_EXE;
	}
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
			"--autoplay-policy=no-user-gesture-required",
		],
		env,
	});
	try {
		const hud = await app.firstWindow();
		await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30_000 });
		await app.evaluate(async ({ BrowserWindow }) => {
			const source = new BrowserWindow({
				width: 400,
				height: 300,
				show: false,
				title: "Pause sidecar test source",
			});
			await source.loadURL(
				"data:text/html," +
					encodeURIComponent(
						"<body style='background:#24a879;font:32px sans-serif'><div></div><script>setInterval(()=>document.querySelector('div').textContent=Date.now(),33)</script></body>",
					),
			);
			source.showInactive();
		});
		const sources = await hud.evaluate(() =>
			window.electronAPI.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 } }),
		);
		const source = sources.find((item) => item.name === "Pause sidecar test source");
		expect(source).toBeTruthy();
		await hud.evaluate((selected) => window.electronAPI.selectSource(selected), source!);
		for (const id of ["launch-microphone-button", "launch-webcam-button"]) {
			if ((await hud.getByTestId(id).getAttribute("title"))?.startsWith("Enable"))
				await hud.getByTestId(id).click();
		}
		await expect
			.poll(() =>
				hud.evaluate(
					() =>
						JSON.parse(localStorage.getItem("openscreen_recording_preferences_v1") ?? "{}")
							.webcamDeviceId,
				),
			)
			.toBeTruthy();
		console.log(
			"RECORDING_TEST_NOTIFICATIONS",
			await hud.locator("[data-sonner-toast]").allTextContents(),
		);
		await hud.getByTestId("launch-record-button").focus();
		await hud.getByTestId("launch-record-button").press("Enter");
		await expect(hud.getByTestId("launch-record-button").locator("span")).toHaveText(/\d+:\d+/, {
			timeout: 30_000,
		});
		await hud.waitForTimeout(1000);
		for (let index = 0; index < 3; index++) {
			await hud.getByTestId("launch-pause-button").click();
			await expect(hud.getByTestId("launch-pause-button")).toHaveAttribute("aria-label", /Resume/);
			await hud.waitForTimeout(700);
			await hud.getByTestId("launch-pause-button").click();
			await expect(hud.getByTestId("launch-pause-button")).toHaveAttribute("aria-label", /Pause/);
			await hud.waitForTimeout(1000);
		}
		const studio = app.waitForEvent("window");
		await hud.getByTestId("launch-record-button").click();
		const editor = await studio;
		await expect.poll(() => editor.evaluate(() => typeof window.electronAPI)).toBe("object");
		const saved = await editor.evaluate(() => window.electronAPI.getCurrentRecordingSession());
		expect(saved.success).toBe(true);
		const media = saved.session!;
		expect(media.microphoneAudioPath).toBe(media.webcamVideoPath);
		expect(media.microphoneOffsetMs).toBe(media.webcamOffsetMs);
		const probe = (file: string) =>
			JSON.parse(
				execFileSync(
					"ffprobe",
					[
						"-v",
						"error",
						"-show_entries",
						"format=duration:stream=codec_type,duration",
						"-of",
						"json",
						file,
					],
					{ encoding: "utf8", windowsHide: true },
				),
			);
		const screenDuration = Number(probe(media.screenVideoPath).format.duration);
		const sidecar = probe(media.webcamVideoPath!);
		expect(sidecar.streams.map((stream: { codec_type: string }) => stream.codec_type)).toEqual(
			expect.arrayContaining(["audio", "video"]),
		);
		const sidecarDuration = Number(sidecar.format.duration);
		const packetEnd = (stream: string) => {
			const result = JSON.parse(
				execFileSync(
					"ffprobe",
					[
						"-v",
						"error",
						"-select_streams",
						stream,
						"-show_entries",
						"packet=pts_time,duration_time",
						"-of",
						"json",
						media.webcamVideoPath!,
					],
					{ encoding: "utf8", windowsHide: true },
				),
			);
			return Math.max(
				...result.packets.map(
					(packet: { pts_time: string; duration_time?: string }) =>
						Number(packet.pts_time) + Number(packet.duration_time ?? 0),
				),
			);
		};
		const cameraEnd = packetEnd("v:0");
		const microphoneEnd = packetEnd("a:0");
		expect(screenDuration).toBeGreaterThan(3);
		expect(
			Math.abs(screenDuration - sidecarDuration - (media.webcamOffsetMs ?? 0) / 1000),
		).toBeLessThan(0.2);
		for (const end of [cameraEnd, microphoneEnd]) {
			expect(Math.abs(screenDuration - end - (media.webcamOffsetMs ?? 0) / 1000)).toBeLessThan(0.2);
		}
		const pcm = execFileSync(
			"ffmpeg",
			[
				"-v",
				"error",
				"-i",
				media.microphoneAudioPath!,
				"-vn",
				"-ac",
				"1",
				"-ar",
				"16000",
				"-f",
				"s16le",
				"pipe:1",
			],
			{ windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
		);
		let peak = 0;
		for (let position = 0; position + 2 <= pcm.length; position += 2)
			peak = Math.max(peak, Math.abs(pcm.readInt16LE(position)));
		expect(peak).toBeGreaterThan(100);
		const offsetInput = editor.getByLabel("Microphone synchronization offset in milliseconds");
		await expect(offsetInput).toBeVisible({ timeout: 30_000 });
		const screenPlayer = editor.locator('video[src*=".mp4"]').first();
		await expect
			.poll(() => screenPlayer.evaluate((video: HTMLVideoElement) => video.readyState))
			.toBeGreaterThanOrEqual(2);
		await screenPlayer.evaluate((video: HTMLVideoElement) => {
			video.currentTime = 1.5;
		});
		await expect
			.poll(() => screenPlayer.evaluate((video: HTMLVideoElement) => video.currentTime))
			.toBeGreaterThan(1);
		await expect(editor.locator("audio")).toHaveCount(0);
		await offsetInput.fill(String((media.microphoneOffsetMs ?? 0) + 100));
		await expect(editor.locator("audio")).toHaveCount(1);
		expect(
			await screenPlayer.evaluate((video: HTMLVideoElement) => video.currentTime),
		).toBeGreaterThan(1);
		await offsetInput.fill(String(media.microphoneOffsetMs ?? 0));
		await expect(editor.locator("audio")).toHaveCount(0);
		console.log(
			`PAUSE_SIDECAR_VALIDATION=${JSON.stringify({ profile, screenDuration, sidecarDuration, cameraEnd, microphoneEnd, offsetMs: media.webcamOffsetMs, media })}`,
		);
	} finally {
		await app
			.evaluate(({ app }) => {
				setTimeout(() => app.quit(), 0);
			})
			.catch(() => undefined);
		await app.close().catch(() => undefined);
	}
});
