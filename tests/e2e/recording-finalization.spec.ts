import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("silent system audio keeps a three-minute capture playable and opens Studio after Stop", async () => {
	test.skip(process.platform !== "win32");
	test.setTimeout(300_000);
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-finalization-"));
	fs.writeFileSync(
		path.join(profile, "after-recording.json"),
		JSON.stringify({ mode: "editor", quietRecording: false }),
	);
	const env = { ...process.env, HEADLESS: "false" };
	delete env.ELECTRON_RUN_AS_NODE;
	const executablePath = process.env.OPENSCREEN_TEST_EXECUTABLE;
	if (executablePath) {
		delete env.VITE_DEV_SERVER_URL;
		delete env.OPENSCREEN_WGC_CAPTURE_EXE;
	}
	const app = await electron.launch({
		...(executablePath ? { executablePath } : {}),
		args: [
			...(executablePath
				? []
				: [path.resolve(process.env.OPENSCREEN_TEST_MAIN ?? "dist-electron/main.js")]),
			`--user-data-dir=${profile}`,
			"--no-sandbox",
			"--lang=en-US",
		],
		env,
	});
	try {
		const hud = await app.firstWindow();
		await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30_000 });
		await app.evaluate(async ({ BrowserWindow }) => {
			const target = new BrowserWindow({
				width: 640,
				height: 360,
				show: false,
				title: "Silent capture test source",
			});
			await target.loadURL(
				"data:text/html," +
					encodeURIComponent(
						"<body style='background:#24a879;color:white;font:32px sans-serif'><canvas width='600' height='280'></canvas><script>const c=document.querySelector('canvas'),x=c.getContext('2d'),start=Date.now();setInterval(()=>{x.fillStyle='#24a879';x.fillRect(0,0,600,280);x.fillStyle='white';x.fillText('Silent capture '+Math.floor((Date.now()-start)/1000)+' s',30,140)},100)</script></body>",
					),
			);
			target.showInactive();
		});
		const sources = await hud.evaluate(() =>
			window.electronAPI.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 } }),
		);
		const source = sources.find((item) => item.name === "Silent capture test source");
		expect(source).toBeTruthy();
		await hud.evaluate((selected) => window.electronAPI.selectSource(selected), source!);
		for (const id of ["launch-microphone-button", "launch-webcam-button"]) {
			if ((await hud.getByTestId(id).getAttribute("title"))?.startsWith("Disable"))
				await hud.getByTestId(id).click();
		}
		if (
			(await hud.getByTestId("launch-system-audio-button").getAttribute("title"))?.startsWith(
				"Enable",
			)
		)
			await hud.getByTestId("launch-system-audio-button").click();
		await hud.getByTestId("launch-record-button").click();
		await expect(hud.getByTestId("launch-record-button").locator("span")).toHaveText(/\d+:\d+/, {
			timeout: 30_000,
		});
		await hud.waitForTimeout(180_000);
		const studio = app.waitForEvent("window", { timeout: 60_000 });
		const stopAt = Date.now();
		await hud.getByTestId("launch-record-button").click();
		const editor = await studio;
		await expect.poll(() => editor.evaluate(() => typeof window.electronAPI)).toBe("object");
		const saved = await editor.evaluate(() => window.electronAPI.getCurrentVideoPath());
		expect(saved.path).toMatch(/\.mp4$/);
		const probe = JSON.parse(
			execFileSync(
				"ffprobe",
				[
					"-v",
					"error",
					"-show_entries",
					"format=duration:stream=codec_type,duration",
					"-of",
					"json",
					saved.path!,
				],
				{ encoding: "utf8", windowsHide: true, timeout: 30_000 },
			),
		);
		const video = Number(
			probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "video")
				.duration,
		);
		const audio = Number(
			probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "audio")
				.duration,
		);
		expect(video).toBeGreaterThan(178);
		expect(Math.abs(video - audio)).toBeLessThan(1);
		const logFile = saved.path!.replace(/\.mp4$/, ".diagnostic.jsonl");
		const rows = fs
			.readFileSync(logFile, "utf8")
			.trim()
			.split("\n")
			.map((row) => JSON.parse(row));
		expect(rows.map((row) => row.event)).toEqual(
			expect.arrayContaining([
				"recording-start",
				"stop-request",
				"helper-close",
				"mp4-validated",
				"session-stored",
			]),
		);
		expect(rows.some((row) => row.event === "stop-error" || row.event === "stop-pending")).toBe(
			false,
		);
		expect(rows.filter((row) => row.event === "helper-close")).toEqual([
			expect.objectContaining({ code: 0, signal: null }),
		]);
		const helperOutput = rows
			.filter((row) => row.event === "helper-stdout")
			.map((row) => row.text)
			.join("");
		expect(helperOutput).toContain('"stage":"encoder-finalize"');
		console.log(
			`FINALIZATION_VALIDATION=${JSON.stringify({ profile, video, audio, stopMs: Date.now() - stopAt, path: saved.path, logFile })}`,
		);
		const quit = app.waitForEvent("close");
		await app.evaluate(({ app }) => {
			setTimeout(() => app.quit(), 0);
		});
		await quit;
	} finally {
		await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
		await app.close().catch(() => undefined);
	}
});
