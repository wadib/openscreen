import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

function powershell(command: string) {
	return execFileSync(
		"powershell.exe",
		["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
		{
			windowsHide: true,
			encoding: "utf8",
			timeout: 15_000,
		},
	).trim();
}
type NativePanel = {
	pid: number;
	executable: string;
	title: string;
	ids: string[];
	names: string[];
};
function nativePanels(): NativePanel[] {
	return JSON.parse(
		powershell(`
		Add-Type -AssemblyName UIAutomationClient
		Add-Type -AssemblyName UIAutomationTypes
		$items=@(Get-Process -Name Blurry -ErrorAction SilentlyContinue | ForEach-Object {
			$ids=@()
			$names=@()
			if($_.MainWindowHandle -ne 0){
				$root=[System.Windows.Automation.AutomationElement]::FromHandle($_.MainWindowHandle)
				$elements=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
				$ids=@($elements|ForEach-Object {$_.Current.AutomationId})
				$names=@($elements|ForEach-Object {$_.Current.Name})
			}
			[pscustomobject]@{pid=$_.Id;executable=$_.Path;title=$_.MainWindowTitle;ids=$ids;names=$names}
		})
		ConvertTo-Json -InputObject $items -Compress -Depth 4
	`),
	);
}

test("Blur is immediately left of Mouse and only summons unchanged original Blurry settings", async () => {
	test.skip(process.platform !== "win32", "Original Blurry is Windows-only");
	const previousPids = new Set(nativePanels().map((panel) => panel.pid));
	test.setTimeout(180_000);
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-blurry-settings-"));
	const env = {
		...process.env,
		HEADLESS: "false",
		OPENSCREEN_BLURRY_INSTANCE: path.basename(profile),
	};
	delete env.ELECTRON_RUN_AS_NODE;
	if (process.env.OPENSCREEN_TEST_EXECUTABLE) {
		delete env.VITE_DEV_SERVER_URL;
		delete env.OPENSCREEN_BLURRY_EXE;
	}
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
	const expectedExecutable = process.env.OPENSCREEN_TEST_EXECUTABLE
		? path.join(
				path.dirname(process.env.OPENSCREEN_TEST_EXECUTABLE),
				"resources",
				"blurry",
				"Blurry.exe",
			)
		: process.env.OPENSCREEN_BLURRY_EXE ||
			path.resolve("..", "Blurry", "Blurry", "bin", "Release", "net8.0-windows", "Blurry.exe");
	const testPanels = () => nativePanels().filter((panel) => !previousPids.has(panel.pid));
	const ownPanel = () =>
		testPanels().find(
			(panel) => panel.executable.toLowerCase() === expectedExecutable.toLowerCase(),
		);
	let owned: NativePanel | undefined;
	try {
		const hud = await app.firstWindow();
		const blur = hud.getByTestId("launch-live-blur-button");
		await expect(blur).toBeEnabled({ timeout: 30_000 });
		await expect(hud.getByTestId("launch-cursor-mode-button")).toBeAttached();
		expect(
			await blur.evaluate((button) => {
				const buttons = Array.from(document.querySelectorAll("button"));
				return buttons[buttons.indexOf(button) + 1]?.dataset.testid;
			}),
		).toBe("launch-cursor-mode-button");
		const blurBounds = await blur.boundingBox();
		const mouseBounds = await hud.getByTestId("launch-cursor-mode-button").boundingBox();
		expect(blurBounds!.x + blurBounds!.width).toBeLessThanOrEqual(mouseBounds!.x);
		const previewWindows = () =>
			app.evaluate(
				({ BrowserWindow }) =>
					BrowserWindow.getAllWindows().filter((win) =>
						win.webContents.getURL().includes("windowType=recording-preview"),
					).length,
			);
		expect(await previewWindows()).toBe(0);
		await expect(blur).toHaveAttribute("aria-pressed", "false");
		await blur.click();
		await expect
			.poll(() => testPanels().filter((panel) => panel.title === "Blurry Settings").length, {
				timeout: 20_000,
			})
			.toBe(1);
		await expect(blur).toHaveAttribute("aria-pressed", "true");
		await expect(blur.locator("svg")).toHaveClass(/text-green-400/);
		owned = ownPanel();
		expect(owned).toBeDefined();
		if (!owned) throw new Error("Original Blurry executable mismatch");
		for (const id of [
			"BlurModeComboBox",
			"ClickThroughCheckBox",
			"BlurDepthSlider",
			"GaussianFactorSlider",
			"AnimationInDurationSlider",
			"AnimationOutDurationSlider",
			"CornerRadiusSlider",
			"FocusShortcutButton",
			"AllMonitorsShortcutButton",
			"ResetShortcutButton",
		])
			expect(owned.ids).toContain(id);
		expect(await previewWindows()).toBe(0);
		powershell(`
			Add-Type -AssemblyName UIAutomationClient
			Add-Type -AssemblyName UIAutomationTypes
			$p=Get-Process -Id ${owned.pid}
			$root=[System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
			$condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'Enable')
			$button=$root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
			if(!$button){throw 'Native monitor Enable control missing'}
			$button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
		`);
		await expect.poll(() => ownPanel()?.names.includes("Disable")).toBe(true);
		await blur.click();
		await expect(blur).toHaveAttribute("aria-pressed", "false");
		await expect(blur.locator("svg")).not.toHaveClass(/text-green-400/);
		await expect.poll(() => ownPanel()?.names.includes("Disable")).toBe(false);
		expect(testPanels().map((panel) => panel.pid)).toEqual([owned.pid]);
		expect(await previewWindows()).toBe(0);
		powershell(`
			$p=Get-Process -Id ${owned.pid}
			if($p.MainWindowTitle -ne 'Blurry Settings'){throw 'Unexpected native window'}
			Add-Type -AssemblyName UIAutomationClient
			Add-Type -AssemblyName UIAutomationTypes
			$root=[System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
			$root.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close()
		`);
		await expect.poll(() => ownPanel()?.title).not.toBe("Blurry Settings");
		await blur.click();
		await expect.poll(() => ownPanel()?.title).toBe("Blurry Settings");
		expect(testPanels().map((panel) => panel.pid)).toEqual([owned.pid]);
		expect(await previewWindows()).toBe(0);
		await expect(blur).toHaveAttribute("aria-pressed", "true");
		await hud.evaluate(() => window.electronAPI.setBlurrySelected(false));
		await expect(blur).toHaveAttribute("aria-pressed", "false", { timeout: 5000 });
		await blur.click();
		await expect(blur).toHaveAttribute("aria-pressed", "true");
		await expect(blur.locator("svg")).toHaveClass(/text-green-400/);
		await expect(blur.locator("svg")).not.toHaveCSS("color", "rgba(255, 255, 255, 0.7)");
		const image = await app.evaluate(async ({ BrowserWindow }) => {
			const win = BrowserWindow.getAllWindows().find((candidate) =>
				candidate.webContents.getURL().includes("windowType=hud-overlay"),
			);
			if (!win) throw new Error("Recorder window is missing");
			const image = await win.webContents.capturePage(undefined, {
				stayHidden: true,
				stayAwake: true,
			});
			if (image.isEmpty()) throw new Error("Recorder capture is empty");
			return image.toPNG().toString("base64");
		});
		fs.writeFileSync(path.join(profile, "blur-left-of-mouse.png"), Buffer.from(image, "base64"));
		console.log(`ORIGINAL_BLURRY_VALIDATION=${profile}`);
	} finally {
		if (!owned) owned = ownPanel();
		if (owned)
			powershell(`
			$p=Get-Process -Id ${owned.pid} -ErrorAction SilentlyContinue
			if($p -and $p.Path -eq '${owned.executable.replace(/'/g, "''")}'){Stop-Process -Id $p.Id}
		`);
		await app.close();
	}
});
