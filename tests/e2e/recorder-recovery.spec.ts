import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

async function launch() {
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-recorder-recovery-"));
	const env = { ...process.env, HEADLESS: "true" };
	delete env.ELECTRON_RUN_AS_NODE;
	if (process.env.OPENSCREEN_TEST_EXECUTABLE) delete env.VITE_DEV_SERVER_URL;
	else
		Object.assign(env, {
			OPENSCREEN_WGC_CAPTURE_EXE: path.resolve("electron/native/bin/win32-x64/wgc-capture.exe"),
		});
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
	const hud = await app.firstWindow();
	await expect(hud.getByTestId("launch-record-button")).toBeAttached({ timeout: 30000 });
	return { app, hud, profile };
}

function powershell(command: string) {
	return execFileSync(
		"powershell.exe",
		["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
		{
			windowsHide: true,
			encoding: "utf8",
			timeout: 15000,
		},
	).trim();
}

test("Stop is idempotent when Windows capture is already absent", async () => {
	test.skip(process.platform !== "win32");
	const { app, hud } = await launch();
	try {
		for (let index = 0; index < 2; index++) {
			expect(
				await hud.evaluate(() => window.electronAPI.stopNativeWindowsRecording()),
			).toMatchObject({ success: true, stopped: true });
		}
		await expect(hud.getByTestId("launch-source-selector-button")).toBeEnabled();
	} finally {
		await app.close();
	}
});

test("recorder stays above a topmost window without stealing focus", async () => {
	test.skip(process.platform !== "win32");
	const { app } = await launch();
	try {
		const handles = await app.evaluate(async ({ BrowserWindow }) => {
			const hud = BrowserWindow.getAllWindows().find((win) =>
				win.webContents.getURL().includes("windowType=hud-overlay"),
			)!;
			hud.showInactive();
			hud.setAlwaysOnTop(false);
			const other = new BrowserWindow({
				...hud.getBounds(),
				frame: false,
				alwaysOnTop: true,
				show: false,
				title: "Topmost recovery test",
			});
			await other.loadURL(
				"data:text/html,<html><body style='background:%2324a879'>Topmost recovery test</body></html>",
			);
			other.show();
			other.focus();
			other.moveTop();
			return {
				hud: hud.getNativeWindowHandle().readBigUInt64LE().toString(),
				hudId: hud.id,
				other: other.getNativeWindowHandle().readBigUInt64LE().toString(),
				otherId: other.id,
			};
		});
		await expect
			.poll(() =>
				app.evaluate(({ BrowserWindow }) =>
					BrowserWindow.getAllWindows()
						.find((win) => win.webContents.getURL().includes("windowType=hud-overlay"))!
						.isAlwaysOnTop(),
				),
			)
			.toBe(true);
		await expect
			.poll(
				() =>
					powershell(
						`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class ZOrder { [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd, uint command); }'; $current=[IntPtr]${handles.other}; $above=$false; for ($i=0; $i -lt 512; $i++) { $current=[ZOrder]::GetWindow($current,3); if ($current -eq [IntPtr]::Zero) { break }; if ($current.ToInt64() -eq ${handles.hud}) { $above=$true; break } }; $above`,
					),
				{ timeout: 10000 },
			)
			.toBe("True");
		expect(
			await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id),
		).not.toBe(handles.hudId);
		await app.evaluate(({ BrowserWindow }) =>
			BrowserWindow.getAllWindows()
				.find((win) => win.webContents.getURL().includes("windowType=hud-overlay"))!
				.minimize(),
		);
		await new Promise((resolve) => setTimeout(resolve, 1200));
		expect(
			await app.evaluate(({ BrowserWindow }) =>
				BrowserWindow.getAllWindows()
					.find((win) => win.webContents.getURL().includes("windowType=hud-overlay"))!
					.isMinimized(),
			),
		).toBe(true);
	} finally {
		await app.close();
	}
});

test("native helper exit resets the controls and preserves partial video", async () => {
	test.skip(process.platform !== "win32");
	test.setTimeout(120000);
	const { app, hud, profile } = await launch();
	try {
		await app.evaluate(async ({ BrowserWindow }) => {
			const target = new BrowserWindow({
				width: 640,
				height: 360,
				show: false,
				title: "Recorder recovery source",
			});
			await target.loadURL(
				"data:text/html,<html><body style='background:%2324a879'><h1>Recovery source</h1></body></html>",
			);
			target.showInactive();
		});
		const sources = await hud.evaluate(() =>
			window.electronAPI.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 } }),
		);
		const source = sources.find((item) => item.name.startsWith("Recorder recovery source"));
		expect(source).toBeTruthy();
		await hud.evaluate((item) => window.electronAPI.selectSource(item), source!);
		expect(
			(await hud.evaluate(() => window.electronAPI.isNativeWindowsCaptureAvailable())).available,
		).toBe(true);
		await hud.getByTestId("launch-record-button").click();
		await expect(hud.getByTestId("launch-record-button")).toContainText(/\d{2}:\d{2}/, {
			timeout: 30000,
		});
		await expect(hud.getByTestId("launch-source-selector-button")).toBeDisabled({ timeout: 30000 });
		await hud.waitForTimeout(2000);
		const parent = await app.evaluate(() => globalThis.process.pid);
		const pid = Number(
			powershell(
				`Get-CimInstance Win32_Process -Filter "Name='wgc-capture.exe' AND ParentProcessId=${parent}" | Select-Object -ExpandProperty ProcessId`,
			),
		);
		expect(Number.isSafeInteger(pid) && pid > 0).toBe(true);
		powershell(`Stop-Process -Id ${pid}`);
		await expect(hud.getByTestId("launch-source-selector-button")).toBeEnabled({ timeout: 10000 });
		expect(await hud.evaluate(() => window.electronAPI.stopNativeWindowsRecording())).toMatchObject(
			{ success: true, stopped: true },
		);
		const videos = fs
			.readdirSync(path.join(profile, "recordings"))
			.filter((name) => name.endsWith(".mp4"));
		expect(videos.length).toBeGreaterThan(0);
		expect(fs.statSync(path.join(profile, "recordings", videos[0])).size).toBeGreaterThan(0);
		console.log(`RECORDER_RECOVERY_VALIDATION=${profile}`);
	} finally {
		await app.close();
	}
});
