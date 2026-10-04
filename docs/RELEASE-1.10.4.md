# Openscreen 1.10.4

## Settings Shortcuts

Settings now has General and Keyboard Shortcuts tabs. It reuses Studio's
existing shortcut configuration, with editable bindings, conflict swapping,
read-only fixed shortcuts and a compact reset/cancel/save footer.

Tab changes preserve shortcut drafts. Escape cancels key capture first.
Save applies the active pane. Successful shortcut saves synchronize open
providers; native Open App registration happens before atomic file replacement.
Invalid, occupied or failed writes leave the previous saved configuration intact.

This does not add recording start/stop, viewer or native Blurry-launch hotkeys.
Blurry settings and hotkeys remain in the original companion panel.

## Build

All times below are 2026-09-15, Asia/Dubai (UTC+04).

The first build encountered access denied in the old CMake pkgRedirects cache.
The native build script now accepts WGC_BUILD_DIR, retaining its normal default.
A fresh temporary cache was used without deleting or changing the old cache.
The retry started approximately 14:06; native capture and cursor helpers rebuilt,
and the original Blurry runtime, license and corresponding source were prepared.

## Validation

- Focused shortcut backend/provider tests passed again: two files, 14 tests.
  Started 14:08:17; duration 30.60 seconds.
- TypeScript and production renderer/main/preload compilation passed.
- Scoped Biome and changed-file whitespace checks passed.
- Prior source Settings integrations passed: shortcuts plus General settings,
  and a separate final compact-layout shortcut rerun with visual inspection.
- Existing unrelated repository translation-check gaps remain; new shortcut
  translation keys were verified in every supported locale.

## Scope

Windows x64 installer. Earlier releases and the running development app are
preserved. No installation, commit, push or version tag was requested.

## Packaged Validation

- The complete Windows build passed, including fresh native helpers, original
  Blurry, production compilation, NSIS installer and block map.
- Packaged shortcut integration passed: edit, conflict swap, tab draft retention,
  Escape cancellation, persistence, actual native hotkey registration, occupied
  binding rejection without overwriting configuration, reset cancellation and
  button-text fit. The compact Settings screenshot was visually inspected.
  Artifacts: C:/Users/DELL/AppData/Local/Temp/openscreen-settings-shortcuts-4ueZPS
- The initial two-test run had one pass and one failure: General Settings
  reported page closure while its Cancel click was completing. Its unchanged
  isolated rerun passed in 51.7 seconds, including preference persistence,
  cancellation, language, external editor and hide/quiet choices. The test uses
  a simulated quiet-mode support adapter, not a real OS quiet-mode transition.
- Both packaged checks passed across the initial run and isolated recheck,
  not a single all-green suite invocation. Package app version was checked
  against 1.10.4. Test profiles and temporary hotkeys did not alter user settings.
- Final verification completed approximately 14:20.

## Delivery

- Installer: D:/REPOS/openscreen/release/1.10.4/Openscreen-Windows-x64-1.10.4-Installer.exe
  Written 14:19:44; 345,137,601 bytes; product version 1.10.4.
  SHA256: 5B4BDB645892CEB2A2F5AE4E4ECAFE58DFB37EE860C4D4211450218D49EF0C42
- Portable: D:/REPOS/openscreen/release/1.10.4/win-unpacked/Openscreen.exe
  Written 14:16:40; 223,286,272 bytes; product version 1.10.4.0.
  SHA256: 09B7E966A4B44C83270ABD74E3A5D922EBC576C31505F86105584D25A21A9AE5
- Authenticode inspection reports NotSigned for both files. The builder emitted
  signing steps, but no publisher signature is present; do not describe these
  artifacts as signed or publisher-verified.
- The installed Program Files copy was not replaced automatically.
