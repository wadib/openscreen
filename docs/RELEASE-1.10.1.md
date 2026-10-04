# Openscreen 1.10.1

## Correction

- Blur is immediately left of Mouse, in horizontal and vertical recorder layouts.
- Clicking Blur only summons the original Blurry Settings panel, separate from
  Openscreen. It does not open Preview or toggle/configure blur.
- Original settings layout and handlers are unchanged, including all monitor,
  behavior, visual, animation, corner-radius and shortcut controls.
- A narrow settings-only named pipe and single-instance mutex let subsequent
  clicks reopen the original window, even after it is closed.
- Preview is independent, without a Blur icon, sidebar or replacement settings.
- Studio's blur effect inspector and Add Blur controls are removed. Existing
  timeline blur data remains loadable and removable.
- Windows packaging includes the self-contained original Blurry executable,
  runtime, license and corresponding source. .NET is needed at build time,
  not installed as a user prerequisite.

The actual Blurry repository is D:/REPOS/Blurry. The OneDrive directory inspected
previously was an empty remnant. Blurry/Windows/SettingsWindow.xaml and its .cs
handlers were not edited. Only Blurry/App.xaml.cs received the reopen bridge.
Settings layout SHA256:
11AFDBAAA170E56D7D59F44EBB1AF46D9AD5E93D9BC7D6FD959EAEA40B2C2A67
Settings handler SHA256:
F25ADD69DB7C24FA9635D8696CD68D7F2C06429325A21E8522E9E1785D772476

## Explicit Remaining Work

This build corrects the launcher and UI design. It does not yet record original
Blurry state into new, removable Studio boxes. Blurry runs its original effects
on the Windows desktop; individual-window capture does not automatically include
its separate overlay windows. Monitor capture may burn overlays into source
pixels, which cannot be removed by deleting a timeline box.

A clean-source recording plus synchronized original Blurry state is still needed
for the full removable workflow. Do not treat this release as completing that
integration. Original Blurry is Windows-only.

## Validation

- Original Blurry Release build passed, zero warnings/errors.
- TypeScript and scoped Biome checks passed.
- 24 focused launcher/IPC and Preview tests passed before packaging.
- Final focused regression suite passed: 104 tests in 14 files (54.50 seconds),
  completed approximately 2026-09-14 22:21:22 Asia/Dubai (UTC+04:00).
- Packaged Settings, styled MP4/GIF/original-copy export, recording recovery and
  topmost checks passed.
- The first ten-scenario packaged run passed eight tests. One hide/reopen test
  encountered an unexpectedly closed page; all four hide/reopen cases passed
  on a clean rerun after packaging had finished.
- The native Blurry workflow passed its functional assertions but initially
  failed its screenshot artifact on the obscured recorder. Switching to native
  Electron capture and correcting its recorder selector resolved the artifact.
- Final native Blurry check passed in 17.3 seconds, approximately
  2026-09-14 22:20 Asia/Dubai (UTC+04:00). It checks all ten original control IDs,
  repeated reopening after close, one process, button adjacency and no Preview.
- Thus all ten packaged scenarios passed across final validation/reruns.
- Recorder screenshot inspected at:
  C:/Users/DELL/AppData/Local/Temp/openscreen-blurry-settings-yyWLhi/blur-left-of-mouse.png
- Tests use isolated profiles and terminate only their own verified companion
  executable; user-owned Blurry instances are not disturbed.

## Delivery

- Installer: D:/REPOS/openscreen/release/1.10.1/Openscreen-Windows-x64-1.10.1-Installer.exe
- Portable: D:/REPOS/openscreen/release/1.10.1/win-unpacked/Openscreen.exe
- Installer last written: 2026-09-14 22:17:18 Asia/Dubai (UTC+04:00).
- Installer size: 345,140,612 bytes.
- Installer SHA256: 7F76EE1F57937573E51CA1FEB5EE5F608511665F3E39C5C5AE3FB3B1265A212B
- Portable FileVersion: 1.10.1; ProductVersion: 1.10.1.0.
- Portable SHA256: 4EBAF119FC17C8D74787A5CFC75C2FF280B5E4A948D2F908E1F2531D5BCBD05B
- npm run build:win succeeded, including Blurry publish and NSIS.
- Earlier releases and the installed Program Files copy are unchanged.
- No installation, commit or push was performed.

See docs/live-blur.md for the current control contract and remaining capture work.
