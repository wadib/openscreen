# Openscreen 1.10.7

## Recording Finalization

- Silent loopback audio advances with timed silence rather than leaving the audio clock behind video.
- Stop no longer kills a slow native writer at its 15-second wait threshold. Pending saves can finish later; errors preserve original recording files.
- Encoder finalization failures are reported as failures, and incomplete MP4 boxes or missing top-level media/playback-index boxes are rejected before session success.
- Each Windows native recording has a timestamped diagnostic JSONL file containing configuration, helper output, errors, shutdown stages, exit status, Stop requests, index checks and session storage.
- Recording error dialogs expose complete details, Copy Details and Show Files.
- Studio/HUD load callbacks ignore destroyed windows and webContents, fixing the reported main-process destroyed-object exception during teardown.

## Source Verification

35 focused unit tests, native C++ silence/start/pause/resume/Stop tests, TypeScript and scoped Biome checks passed. Source Windows integrations passed for a three-minute system-audio capture/save/Studio/clean-Quit flow and the no-audio native capture with hide/Studio-close lifecycle.

The historical half-hour failure's exact cause is not proven. Only partial recovery was possible; incident and recovery evidence are documented separately in docs/RECORDING-INCIDENT-2026-09-15.md.

## Build Scope

Windows x64 installer, following release/${version} and the existing installer naming convention. Original Blurry settings/runtime/license/source remain bundled. Older releases and user recordings are preserved. Building does not automatically replace or close the installed application.

Build started at 20:54:58 on 2026-09-15, UAE local time (UTC+04:00). Installer finalized at 21:42:44; packaged verification completed at approximately 21:46. Native helpers, original Blurry, TypeScript and production renderer/main/preload compilation succeeded. Two packaging-only retries investigated an unusually slow pre-archive stage; temporary instrumentation confirmed steady file processing, and the final run completed successfully without disabling archive safety checks or editing dependencies.

No macOS/Linux build or full half-hour soak test is claimed. The installed 1.10.6 application was not replaced or closed.

## Delivery

- Installer: D:\REPOS\openscreen\release\1.10.7\Openscreen-Windows-x64-1.10.7-Installer.exe
- Size: 345,139,363 bytes.
- SHA256: CC0CC08DA52E74E09FECBCD0073024962AAAF048C60237E083E7DEF2AEFC42A9
- Installer product version: 1.10.7. Packaged executable product version: 1.10.7.0.
- Authenticode: NotSigned; Windows may display an unsigned-publisher warning.
- Packaged app: release\1.10.7\win-unpacked\Openscreen.exe.
- app.asar: 428,285,652 bytes, package version 1.10.7; contains the new finalization diagnostics and pending-save handling, with no main-verify duplicate.
- Packaged wgc-capture.exe matches the rebuilt source binary, SHA256 65CA2DB2D7E084EDF058C3B629937D3480B478F746E83C6B7C8441CB3477A650. Original Blurry runtime, source and license are present.

## Packaged Verification

Six Playwright Electron checks passed in 5.2 minutes using the packaged executable and isolated profiles, without a development server or native-helper override:

- Three-minute Windows test-window capture with system audio: video 180.316650 seconds, audio 180.373312 seconds. Stop-to-Studio approximately 2,976 ms; helper exit 0, complete finalization diagnostics, saved session, Studio opened and application quit cleanly.
- Real Windows quiet-recording activation and restoration after Stop.
- All four hide-after-recording/hide-after-video combinations, including native no-audio capture, saved/dismissed visibility, closing Studio without quitting Openscreen, and clean application shutdown. Saved visibility events use a fixture, not a real export.

Strict full-file FFmpeg decoding of the three-minute MP4 passed with -xerror -err_detect explode. Recording and diagnostic evidence are retained in release\1.10.7\validation\openscreen-finalization-QMd56U\recordings\recording-1789494090231.mp4 and its adjacent .diagnostic.jsonl file.

An additional build-time focused rerun passed 33 tests across six files in 97.65 seconds (capture-stop, diagnostics, MP4 validation, destroyed-window handling, recording-session behavior and recorder lifecycle).
