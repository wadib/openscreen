# Openscreen 1.10.6

## Recording Preferences

Microphone, system audio, webcam, cursor mode, and chosen microphone/camera IDs
and names persist across recorder recreation, Studio close, and app restart.
The default microphone is included. Explicit selections are saved immediately;
temporary camera failures and media teardown do not overwrite saved choices.
Unavailable cameras still report their error rather than pretending to record.

## Countdown And Startup

The countdown centers on the selected recording display or current Windows
window bounds, rather than the controls' monitor. Windows queries use visible
DWM bounds, excluding invisible resize borders, and convert physical pixels to
Electron display-independent coordinates. Moved/resized windows are queried
again for each recording. Existing 3-2-1 rendering and topmost behavior remain.

Quiet-mode preparation and webcam readiness happen before the visible countdown,
not afterward. A busy indicator remains until capture acknowledges startup.
Recording settings, source selection, and Studio opening are disabled during
preparation/countdown. Cancellation restores quiet mode and discards a canceled
native start; repeated clicks cannot start a second pending capture.
Native encoder/cursor startup still follows the countdown; no zero-latency claim.

## Source Validation

- TypeScript and scoped Biome checks passed.
- Twenty focused unit tests passed, including preference merging/validation,
  remembered devices, explicit deselection, temporary camera failure, countdown
  ordering, quiet preparation, cancellation, and native Stop recovery.
- Seven source Electron checks passed together in 1.4 minutes on Windows:
  selected-display/window countdown, persistence across Studio close/dismiss/app
  restart, real quiet-mode capture/restoration, and all four hide-flag combinations.
- Persistence uses fake camera/microphone devices in an isolated profile.
  Native captures use controlled test windows, with audio/webcam disabled, and
  validate nonempty MP4 files with an ftyp header. Saved-video visibility events
  use a fixture, not a full export-button test. No physical webcam test is claimed.
- Source persistence artifacts:
  C:/Users/DELL/AppData/Local/Temp/openscreen-recording-preferences-shuaQ3
- Source countdown artifacts:
  C:/Users/DELL/AppData/Local/Temp/openscreen-countdown-dBafKs
- Source quiet recording artifacts:
  C:/Users/DELL/AppData/Local/Temp/openscreen-quiet-recording-GOSOnF

## Build Scope

Windows x64 installer rebuild started approximately 15:48 on 2026-09-15,
Asia/Dubai (UTC+04). Original Blurry settings/runtime/license/source are retained.
Older release directories, the installed copy, and user processes are untouched.
No installation, commit, push, or tag was requested.
macOS/Linux were not built or executed; foreign-window countdown bounds in this
change are implemented for Windows only.

## Installer Build

The full app build passed, including native helpers, original Blurry,
TypeScript, and production bundles. The initial NSIS attempt failed at 15:57
with an error mapping a 361,013,684-byte temporary file. C: had only
258,949,120 bytes free. Installer-only packaging was retried using TEMP/TMP
under release/1.10.6/build-temp on D:, reusing the completed app/archive.
The retry and block-map generation passed; no full recompilation was needed.

## Delivery

- Installer: D:/REPOS/openscreen/release/1.10.6/Openscreen-Windows-x64-1.10.6-Installer.exe
  Written 2026-09-15 15:59:10 UTC+04; 345,140,096 bytes; product version 1.10.6.
  SHA256: 097E63AC257EBB432FF98471F915BAAE1BC797B7B4C6C40BC1F5225AB3B89A18
- Portable: D:/REPOS/openscreen/release/1.10.6/win-unpacked/Openscreen.exe
  Written 2026-09-15 15:55:50 UTC+04; 223,286,272 bytes; product version 1.10.6.0.
  SHA256: 2AA1D8D04BEE211EBB2F1E7D84602A92F4387289B514E55C0FC9D7F40046F3D5
- Authenticode reports NotSigned for both artifacts.
- Free space on C: before installing; build temporary-file redirection does
  not change the installer user's temporary directory or installation drive.
- The installed/running copy was not replaced, closed, or upgraded automatically.

## Packaged Validation

Seven checks passed together in 2.0 minutes against the actual 1.10.6
win-unpacked executable. Validation completed by 16:02:20 UTC+04 on 2026-09-15.
VITE_DEV_SERVER_URL and native-helper overrides were removed, so these tests
used production bundles and packaged native resources rather than the dev server.

- Countdown rendered 3-2-1 on the selected display and centered on moved/resized
  Windows targets, remaining topmost and hiding as expected.
- Recorder preferences survived Studio close, recording dismissal, and process
  restart with the same isolated profile and fake media devices.
- Quiet mode activated during a real native recording and restored the exact
  prior Windows profile after Stop. A nonempty MP4 with an ftyp header was saved.
- All four hide-flag combinations passed finish/save-notification/dismiss/Studio
  close visibility checks and explicit Quit. The both-enabled case recorded a
  real controlled window; its post-stop Studio remained hidden. The capture
  window was destroyed before testing later Studio close to avoid masking Quit.
- Packaged artifacts/profiles are retained under:
  D:/REPOS/openscreen/release/1.10.6/validation
- Countdown: openscreen-countdown-0JFvGK
- Preferences: openscreen-recording-preferences-0rz8V7
- Quiet capture: openscreen-quiet-recording-RPa471
- Hide profiles, recording/video flag order:
  false/false: openscreen-window-lifecycle-KhFPir
  false/true: openscreen-window-lifecycle-Mlm0PF
  true/false: openscreen-window-lifecycle-0xQg0j
  true/true: openscreen-window-lifecycle-Sk8QW7
