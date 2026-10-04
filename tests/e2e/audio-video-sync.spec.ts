import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

test("audible markers stay aligned with screen flashes across repeated loopback silence", async () => {
	test.skip(process.platform !== "win32");
	test.setTimeout(180_000);
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-av-sync-"));
	fs.writeFileSync(
		path.join(profile, "after-recording.json"),
		JSON.stringify({ mode: "editor", quietRecording: false }),
	);
	const env = { ...process.env, HEADLESS: "false" };
	delete env.ELECTRON_RUN_AS_NODE;
	const executablePath = process.env.OPENSCREEN_TEST_EXECUTABLE;
	if (executablePath) delete env.VITE_DEV_SERVER_URL;
	const app = await electron.launch({
		...(executablePath ? { executablePath } : {}),
		args: [
			...(executablePath ? [] : [path.resolve("dist-electron/main.js")]),
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
		await app.evaluate(async ({ BrowserWindow }) => {
			const target = new BrowserWindow({
				width: 400,
				height: 300,
				frame: false,
				show: false,
				title: "AV sync test source",
			});
			await target.loadURL(
				"data:text/html," +
					encodeURIComponent(
						"<body style='margin:0;background:black'><script>window.startMarkers=async()=>{const a=new AudioContext();await a.resume();await a.suspend();for(let i=0;i<7;i++)setTimeout(async()=>{await a.resume();const o=a.createOscillator(),g=a.createGain();o.frequency.value=1000;g.gain.value=.3;o.connect(g).connect(a.destination);o.start(a.currentTime+.05);o.stop(a.currentTime+.35);setTimeout(()=>document.body.style.background='white',50);setTimeout(()=>document.body.style.background='black',350);setTimeout(()=>a.suspend(),500)},2000+i*8000);return 'ready'}</script></body>",
					),
			);
			target.showInactive();
		});
		const sources = await hud.evaluate(() =>
			window.electronAPI.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 } }),
		);
		const source = sources.find((item) => item.name === "AV sync test source");
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
		const target = app.windows().find((page) => page.url().startsWith("data:text/html"));
		expect(target).toBeTruthy();
		expect(
			await target!.evaluate(() =>
				(window as unknown as { startMarkers: () => Promise<string> }).startMarkers(),
			),
		).toBe("ready");
		await hud.waitForTimeout(53_000);
		const studio = app.waitForEvent("window", { timeout: 60_000 });
		await hud.getByTestId("launch-record-button").click();
		const editor = await studio;
		await expect.poll(() => editor.evaluate(() => typeof window.electronAPI)).toBe("object");
		const saved = await editor.evaluate(() => window.electronAPI.getCurrentVideoPath());
		expect(saved.path).toMatch(/\.mp4$/);
		const decode = (args: string[]) =>
			execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", saved.path!, ...args], {
				windowsHide: true,
				timeout: 30_000,
				maxBuffer: 16 * 1024 * 1024,
			});
		const pixels = decode([
			"-an",
			"-vf",
			"crop=16:16:(iw-16)/2:(ih-16)/2,scale=1:1,fps=30",
			"-pix_fmt",
			"gray",
			"-f",
			"rawvideo",
			"pipe:1",
		]);
		const visual: number[] = [];
		for (let i = 1; i < pixels.length; i++) {
			if (pixels[i] > 160 && pixels[i - 1] <= 160) visual.push(i / 30);
		}
		const pcm = decode([
			"-vn",
			"-af",
			"bandpass=f=1000:width_type=h:width=200",
			"-ac",
			"1",
			"-ar",
			"16000",
			"-f",
			"s16le",
			"pipe:1",
		]);
		const audio: number[] = [];
		const levels: number[] = [];
		for (let offset = 0; offset + 320 <= pcm.length; offset += 320) {
			let energy = 0;
			for (let i = offset; i < offset + 320; i += 2) energy += pcm.readInt16LE(i) ** 2;
			levels.push(Math.sqrt(energy / 160));
		}
		const peak = Math.max(...levels);
		expect(peak).toBeGreaterThan(20);
		let sounding = false;
		for (let index = 0; index < levels.length; index++) {
			const above = levels[index] > peak * 0.35;
			if (above && !sounding) audio.push(index / 100);
			sounding = above;
		}
		expect(visual).toHaveLength(7);
		expect(audio).toHaveLength(7);
		const offsets = audio.map((time, index) => time - visual[index]);
		expect(Math.max(...offsets.map(Math.abs))).toBeLessThan(0.2);
		expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThan(0.15);
		console.log(
			`AV_SYNC_VALIDATION=${JSON.stringify({
				path: saved.path,
				visual,
				audio,
				offsets,
				helperOverride: env.OPENSCREEN_WGC_CAPTURE_EXE ?? null,
			})}`,
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
