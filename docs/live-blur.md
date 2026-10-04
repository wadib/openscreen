# Original Blurry Panel Integration

## Current Controls (1.10.2)

- Blur is immediately left of the recorder Mouse icon.
- Selecting Blur opens/reactivates the original Blurry Settings window and turns
  its icon green, only after native confirmation.
- Deselecting sends a targeted Escape command to Blurry's existing reset handler:
  disable active overlays and cancel any in-progress area selection. Green turns
  off only after acknowledgement.
- No global keyboard injection is used. Other applications never receive Escape.
- Reset preserves saved Blurry settings and area coordinates; it does not quit
  Blurry or close its settings panel.
- Native monitor changes, reset hotkeys/tray Reset and companion exit are reflected
  in the button through its native state check (approximately once per second).
- No recording source selection is required to open settings.
- Repeated clicks reuse the same Blurry process and panel; closing its panel
  retains Blurry's tray application.
- Preview independently shows/hides the existing recording viewer.
- Preview has no Blur button, blur sidebar or replacement blur settings.
- Studio has no blur effect inspector or Add Blur button. Existing recorded
  blur clips remain on their timeline track and can be deleted there.

## Original Application

The authoritative source is D:/REPOS/Blurry, not the empty OneDrive remnants.
The native WPF settings XAML and settings handlers are unchanged. Original monitor
controls, three focus/selection modes, click-through, blur depth, Gaussian factor,
animation durations, corner radius and configurable hotkeys remain in Blurry.

A narrow current-user named-pipe bridge in Blurry/App.xaml.cs reopens settings;
a per-user single-instance mutex prevents duplicate hotkeys and tray processes.
The original panel and its settings handlers are unchanged. The bridge supports
settings, Escape/reset and selected-state commands, with no preview-window calls.
OPENSCREEN_BLURRY_INSTANCE supplies a validated private namespace for isolated
automated tests; normal operation retains one current-user Blurry instance.

Blurry performs its effects on the actual Windows desktop through its original
overlay implementation, not through the Openscreen preview canvas.

## Build

npm run build:win prepares the original Blurry companion before packaging.
Set OPENSCREEN_BLURRY_SOURCE if its source repository is not a sibling of Openscreen.
The build requires .NET and the settings-only reopen bridge.

Windows resources/blurry contains the self-contained original app, its license
and corresponding source under source/. Build the included source with:
dotnet publish source/Blurry/Blurry.csproj -c Release -r win-x64 --self-contained true

Exit an already-running older Blurry from its tray before using this updated
companion: it cannot acknowledge the new Escape/state protocol. Openscreen does
not kill or replace a user-owned running process.

An explicit OPENSCREEN_BLURRY_EXE overrides executable discovery. Development
otherwise uses the sibling Blurry Release build; packaged builds use resources/blurry.

## Remaining Capture Work

This correction is the original-settings launcher and UI cleanup, not a completed
removable-Blurry recording integration. Original Blurry changes do not yet create
new Openscreen timeline boxes. Existing 1.10.0 blur-session/project data still loads.

Capturing a monitor may include desktop overlays; capturing an individual window
does not automatically include separate Blurry overlay windows. An overlay burned
into source pixels cannot subsequently be removed by deleting a timeline box.
Recording original Blurry state separately from clean source media remains required
for a fully removable workflow. Do not assume window capture includes Blurry.

Original Blurry is Windows-only. No macOS/Linux version is supplied.

## Verification

npm test -- electron/recording/blurry-settings.test.ts electron/recording/live-blur-ipc.test.ts src/hooks/useRecordingPreview.test.ts src/hooks/useWebcamRecordingPreview.test.ts

The native Electron integration test is tests/e2e/blurry-settings.spec.ts. It checks
button order, green on/off states, unchanged native control IDs, monitor
activation/reset, repeated reopening, external reset synchronization, one test
Blurry process and no preview-window creation. It closes only its own isolated apps.
