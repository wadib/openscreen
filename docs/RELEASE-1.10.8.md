# Openscreen 1.10.8

## Microphone synchronization

- Preserves WASAPI packet timestamps instead of shifting microphone samples according to arrival order.
- Places microphone and system-audio packets on timestamped queues sharing the screen-video recording clock.
- Keeps silence at its original position, handles stale packets without shifting later sound, and flushes the buffered audio tail on Stop.
- Uses one performance-counter epoch for screen, webcam and audio, including pause duration.
- Records packet count, discarded-packet count and maximum delivery latency in per-record diagnostics.

## Source verification

- Native tests passed for simulated half-hour gaps, stale and partial packets, silence, pause/resume, Stop, buffered-tail flushing, and out-of-order 44.1 kHz mono microphone packets resampled to 48 kHz stereo.
- A 54-second real screen/system-audio test with seven flash/tone markers passed. Offset stayed between 43 and 97 ms without increasing drift; strict FFmpeg decoding passed.
- TypeScript and scoped Biome checks passed.

The real flash/tone test validates the shared recording path but is not a physical-microphone or half-hour hardware soak test. Detailed evidence is in docs/AUDIO-SYNC-2026-09-15.md.

## Build scope

Windows x64 installer. Older releases, recordings and the installed application were preserved; nothing was installed automatically.

## Delivery

- Installer: D:\REPOS\openscreen\release\1.10.8\Openscreen-Windows-x64-1.10.8-Installer.exe
- Size: 345,140,787 bytes.
- SHA256: 8EBC7291477F32D6E3340B2360D100C469ECAD1A6E5AE71A0D2C5C668C086328
- Installer version: 1.10.8. Packaged executable version: 1.10.8.0.
- Authenticode: NotSigned; Windows may display an unsigned-publisher warning.
- Packaged app: release\1.10.8\win-unpacked\Openscreen.exe.
- app.asar: 428,285,652 bytes, package version 1.10.8.
- Embedded wgc-capture.exe matches the rebuilt source binary, SHA256 004A0AEDEE180798B3F295F765ADF6B9A4B25E061A71DB6967B125558A69AC18. Original Blurry is present.

## Packaged verification

Seven Playwright Electron checks passed against the packaged executable using isolated profiles and no development server or native-helper override:

- Three-minute Windows test-window capture with system audio: video 180.833333 seconds, audio 180.863979 seconds; difference approximately 31 ms. Stop-to-Studio took 1,641 ms. Native helper exited successfully, finalization diagnostics were complete, Studio opened and the app quit cleanly. Strict full-file FFmpeg decoding passed.
- Real Windows quiet-recording activation and restoration after Stop.
- All four hide-after-recording/hide-after-video combinations, including native no-audio capture, saved/dismissed visibility and closing Studio without quitting Openscreen.
- Packaged flash-and-tone synchronization with seven markers and repeated silent gaps. Sound-minus-flash offsets were 33.3, 56.7, 76.7, 20.0, -6.7, 50.0 and 53.3 ms; no increasing drift. The test reported an empty helperOverride, proving it used the embedded 1.10.8 helper.

Evidence is retained under release\1.10.8\validation. Build and packaged verification completed on 2026-09-16, UAE local time (UTC+04:00). No physical-microphone or half-hour hardware soak test is claimed.
