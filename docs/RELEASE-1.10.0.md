# Openscreen 1.10.0

## Scope

- The recorder Blur icon opens the live viewer and compact blur controls.
- Draw, move, resize or delete up to 16 areas while recording. Gaussian blur and
  mosaic support rectangle/oval shapes, strength and white/black tint.
- The viewer composites the screen, webcam and active blur. Closing its controls
  does not remove blur.
- Changes are captured as timed, non-destructive snapshots. Pauses are excluded;
  Windows timing follows encoded frames. Overlapping areas retain stable order.
- Recorded blur imports as editable clips on the Studio Blur track. The Blur
  tool is immediately below Crop; its inspector shares the live controls.
- Styled MP4/GIF apply edited blur. Original MP4 copying is blocked for recorded
  blur sessions. External-editor mode redirects those sessions to Studio.
- Session manifests and project saves preserve blur data, including sessions
  receiving a webcam recording.
- Preview strength scales from original source dimensions; crop/zoom projection
  preserves source coordinates and oval geometry.
- Windows GPU readback now matches the capture texture before trimming H.264
  dimensions, fixing black frames for some odd-sized capture windows.
- Export notifications have a dismiss control and no longer cover export buttons.
- Existing after-recording preferences, hide/reopen behavior, quiet recording and
  the normal native MP4 backend remain available.

## Privacy And Platform Limits

Source video remains unblurred for editing. Treat recordings and project media
as sensitive; share a styled export, not the source. Gaussian blur is not
guaranteed irreversible redaction.

The live viewer is Windows-only. Shared session/editor/export logic is
platform-independent, but macOS/Linux live viewing is not implemented or verified.
Live changes create separate timeline snapshots, not animation keyframes.

The supplied Blurr/blurry directory contained empty directories and no source
files. No third-party Blurry code was imported.

## Validation

- 96 focused Vitest tests passed in 12 files, completed approximately
  2026-09-14 20:57 Asia/Dubai (UTC+04:00).
- TypeScript and scoped Biome checks passed.
- Source Electron checks passed for all ten scenarios across the suite and a
  direct-export rerun after fixing notification interception. One source test
  cleanup required terminating its verified, isolated Electron process; the
  final packaged run is recorded separately below.
- Integration verifies actual viewer pixels, pause-aware blur clips against
  encoded media duration, unblurred source pixels, actual styled MP4/GIF pixels,
  Original MP4 protection and Studio timeline editing.
- All ten tests passed against release/1.10.0/win-unpacked/Openscreen.exe without
  a development server (3.1 minutes). Confirmed complete at
  2026-09-14 21:04:20 Asia/Dubai (UTC+04:00); isolated applications closed normally.
- Packaged Studio screenshot was inspected: rendered blur, region handles,
  compact settings and Blur timeline clips are present.
- Packaged artifacts:
  C:/Users/DELL/AppData/Local/Temp/openscreen-live-blur-ztPGM9
  C:/Users/DELL/AppData/Local/Temp/openscreen-after-recording-QaNoLC
  C:/Users/DELL/AppData/Local/Temp/openscreen-recorder-recovery-sIwRA5

## Delivery

Version is 1.10.0 in package.json and the root package-lock.json entries.
Earlier releases are preserved. This build does not install or modify the
Program Files application. No commit or push was requested.

- Installer: D:/REPOS/openscreen/release/1.10.0/Openscreen-Windows-x64-1.10.0-Installer.exe
- Portable: D:/REPOS/openscreen/release/1.10.0/win-unpacked/Openscreen.exe
- Installer last written: 2026-09-14 21:00:42 Asia/Dubai (UTC+04:00).
- Installer size: 289,394,889 bytes.
- Installer SHA256: 23A83EE86F4056998F813ADB69AA11E661CFFB8E71E000739990F60DCF5A02F3
- Portable executable FileVersion: 1.10.0; ProductVersion: 1.10.0.0.
- Portable executable SHA256: CBB8BC63BE58D3C0D333C5499813AFEE0313370C769D25F61035B09D376E737A
- npm run build:win completed successfully: native helper, TypeScript, Vite,
  Electron packaging and NSIS installer. Existing dependency warnings were
  non-blocking.

See docs/live-blur.md for workflow, geometry, privacy and integration-test details.
