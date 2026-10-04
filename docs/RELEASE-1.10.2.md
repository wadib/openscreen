# Openscreen 1.10.2

## Blur Toggle

- Blur remains immediately left of Mouse.
- Selecting opens/reactivates the unchanged original Blurry panel; the icon turns
  green only after Blurry confirms its selected state.
- Deselecting sends Escape/reset directly to Blurry through its companion pipe.
  The same handler serves Blurry's configured Reset hotkey and tray Reset.
- Reset disables active monitor overlays and cancels an in-progress area selector.
  Saved settings and selected-area coordinates are preserved.
- No global keyboard injection, Preview opening, replacement settings, process
  termination or settings-panel closure is triggered by deselection.
- Duplicate clicks are blocked while awaiting acknowledgement. Failed resets
  leave the selected state intact and report the error.
- Native reset/monitor changes and companion exit synchronize to the recorder
  through native state checks (approximately once per second).
- Development companion discovery uses the existing APP_ROOT contract, including
  direct Electron launches from dist-electron/main.js.
- Tests use a validated isolated pipe/mutex namespace, separate from any running
  user Blurry instance. Normal operation still uses one current-user instance.

The original Blurry settings XAML and settings handlers remain unchanged.
This is the button behavior requested after 1.10.1, not completion of the separate
clean-source/removable-Studio-box recording integration described in live-blur.md.

## Upgrade

Exit an older Blurry once from its tray before using 1.10.2: the old companion
cannot acknowledge the new state/Escape protocol. Openscreen does not kill the
running user application or erase its preferences. The settings panel remains a
separate original WPF window, not a Preview or Studio inspector.

## Validation

- Original Blurry Release build passed with zero warnings/errors.
- TypeScript and scoped Biome checks passed.
- 22 focused toggle/IPC/hook tests passed before packaging.
- Source Electron native test passed in 27.2 seconds: green on/off, actual monitor
  Enable/reset, unchanged original controls, single-process reopening, external
  reset synchronization and no Preview window.
- Source test artifact:
  C:/Users/DELL/AppData/Local/Temp/openscreen-blurry-settings-7YwQoM
- Initial live validation skipped rather than disturb the user's running Blurry.
  The isolated test then caught and verified the development companion-path fix.
- An initial broad unit run timed out starting its 15 workers during packaging;
  no test cases executed. The final bounded-worker run is recorded below.

- Final bounded-worker regression run: 118 tests in 15 files passed in 72.42
  seconds; started 2026-09-14 22:50:20 UTC+04, finished approximately 22:51:32.
- Final packaged Electron run: all 10 tests passed in 2.1 minutes; completion
  confirmed 2026-09-14 22:54:21 UTC+04. Includes native Blurry toggle/reset,
  export, hide/reopen, recording-stop recovery and topmost controls.
- Visible packaged screenshot inspected: green Blur immediately left of Mouse.
  C:/Users/DELL/AppData/Local/Temp/openscreen-blurry-settings-p4LH6O/blur-left-of-mouse.png
- Isolated test processes were cleaned up; the user's existing Blurry was left
  running. Windows is the supported platform for the original WPF companion.

## Delivery

All times above and below are Asia/Dubai (UTC+04), 2026-09-14.

- Installer: D:/REPOS/openscreen/release/1.10.2/Openscreen-Windows-x64-1.10.2-Installer.exe
  Written 22:49:54; 345,141,030 bytes; version 1.10.2.
  SHA256: 3391FA52E673B3D6137E5A24E8511DBACEB605657BFBE7CB851A3F02C0DE81E2
- Portable: D:/REPOS/openscreen/release/1.10.2/win-unpacked/Openscreen.exe
  Written 22:48:04; 223,286,272 bytes; version 1.10.2.
  SHA256: 9262687119CB7693EE855BC5F81E9AAD37C594AC04237186F633D7274AFA3168
- Includes the original Blurry companion, self-contained .NET 8 runtime, license
  and corresponding source under resources/blurry.
- Earlier releases were preserved. The installed Program Files application was
  not replaced. No installation, commit, push or version tag was performed.
