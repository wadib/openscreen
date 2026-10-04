# Openscreen 1.9.0

## Scope

Two independent Settings checkboxes, both off by default:

- Hide after recording finishes: open the selected Openscreen editor/export view
  without showing it; external-editor mode returns to a hidden recorder.
- Hide after video is saved or dismissed: hide after successful MP4/GIF export;
  direct export copies its saved path first. Done returns to a hidden recorder.
  Closing Studio hides its window after any unsaved-changes confirmation.

Hiding retains the application and original recordings. Tray Open, the existing
global shortcut and macOS dock reopen the current window. Explicit New recording
still opens the recorder. Canceling or failing to save does not trigger hiding.
Tray Quit continues to quit, rather than being intercepted by automatic hiding.

Preferences remain in userData/after-recording.json, with optional boolean fields
hideAfterRecording and hideAfterVideo. Existing preferences need no migration.
Settings retains native selects/checkboxes and its existing Save/Cancel footer;
the window is 420x440 to accommodate all choices and the external-editor picker.
Both labels are translated in all 13 supported languages.

## Validation

- 26 focused Vitest tests passed: preferences, recorder lifecycle and direct
  export controls.
- Nine source Electron tests passed: Settings persistence/cancellation,
  real styled MP4/GIF and original MP4 export, automatic hiding and tray reopening,
  both editor modes with hide-after-recording on/off, and Windows stop/topmost/
  helper-exit recovery.
- Four final source Electron lifecycle tests passed after the quit guard was
  added, including unsaved-change Cancel/discard and quitting a hidden window.
- All nine tests also passed against release/1.9.0/win-unpacked/Openscreen.exe
  without a development server (1.7 minutes). Packaged validation was confirmed
  complete at 2026-09-14 19:32:33 Asia/Dubai (UTC+04:00).
- TypeScript and scoped Biome checks passed, including all 13 launch locales.
- An initial test fixture outside the approved recordings directory was rejected
  by the existing media permission check; the corrected fixture is under
  recordings/ and the complete suite passed on rerun.

The visibility implementation uses shared Electron APIs. Native macOS/Linux
execution is not claimed; this release was tested and built on Windows.
The normal native MP4 backend and quiet-recording adapters are unchanged.

## Delivery

Version is 1.9.0 in package.json and both root package-lock.json entries.
Output uses release/1.9.0; earlier releases are preserved. Building does not
install the application or modify Program Files. No commit or push was requested.

Windows artifacts:

- Installer: D:/REPOS/openscreen/release/1.9.0/Openscreen-Windows-x64-1.9.0-Installer.exe
- Portable: D:/REPOS/openscreen/release/1.9.0/win-unpacked/Openscreen.exe
- Installer last written: 2026-09-14 19:29:04 Asia/Dubai (UTC+04:00).
- Installer size: 289,390,629 bytes.
- Installer SHA256: E9B7CDF4A7D33D95692E18EDDC2E847BF44B7F3BFE3CBB5B4EAD72D3D062A935
- Windows executable FileVersion: 1.9.0; ProductVersion: 1.9.0.0.
- npm run build:win completed successfully (native helper, TypeScript, Vite,
  electron-builder and NSIS); existing dependency warnings were non-blocking.
