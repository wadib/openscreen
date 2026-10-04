# Recording Incident And Source Fixes - 2026-09-15

All human-readable times are UAE local time (UTC+04:00). JSONL diagnostics use UTC ISO timestamps.

## Status

Source fixes are in D:\REPOS\openscreen. The existing release/1.10.6 installer and installed C:\Program Files\Openscreen\Openscreen.exe are unchanged. No version bump, commit, push, installation, or full installer rebuild was performed during this investigation.

## Incident Evidence

The user reported a roughly half-hour recording that stopped after a clipped message and did not open Studio.

- Installed app: Openscreen 1.10.6.
- After-recording mode was editor; hide options were not enabled.
- Original recording-1789485694678.mp4: created 19:21:34, last written 19:53:18, 32,123,267 bytes.
- Read-only box inspection found ftyp, uuid, and mdat, but no moov index. ffprobe reports "moov atom not found".
- Two preceding recordings were also unfinalized; an earlier recording was healthy and provided the codec reference for recovery.
- No durable native capture log existed in that version. Windows event/crash checks did not reveal an attributable event.

The exact historical failure is not proven. Existing Stop code killed a helper after 15 seconds; a second force-kill cleanup existed. An audio clock could also stop when silent loopback supplied no packets. Either could contribute to an unfinalized recording, but source inspection alone cannot establish which happened in the user's session.

## Recovery

Only copies were processed locally with official Untrunc and FFmpeg.

- Working folder: release/1.10.6/recovery.
- Recommended playback file: recovered-playable.mp4.
- Container duration: 148.966667 seconds, approximately 2:29.
- Video stream: 147.966667 seconds, 1920x1080 H.264.
- Audio stream: 68.160000 seconds, approximately 1:08 AAC.
- Strict decode succeeded; a frame at 75 seconds was visually checked.
- Original and copy SHA-256 match: 96901807A6F76AB07E3743D93813E724A227365DD0EB9DAA2788D4BFF56F7200.

This is partial recovery, not the full half-hour. Missing original indexing means reconstructed timestamps cannot establish exact original timing or coverage. Full provenance, output checksum, commands and limitations are in release/1.10.6/recovery/RECOVERY-REPORT.md. Original files were never overwritten, moved, or deleted.

## Source Changes

- electron/recording/capture-stop.ts: a slow Stop returns a pending error without killing the writer. A later Stop can finish after the helper exits. Nonzero exits remain errors even if stdout claimed success.
- electron/recording/diagnostics.ts: per-recording append-only JSONL logs persist configuration, timestamps, raw helper stdout/stderr, errors, exit code/signal, Stop requests, index checks and session storage.
- electron/recording/validate-mp4.ts: read-only structural checks reject incomplete boxes and missing top-level media/index boxes. This is not a substitute for full decoding.
- electron/ipc/handlers.ts: removes Stop timeout/cleanup kills, preserves pending state and original files on errors, supports late finalization and remembered explicit discard intent, and shows a complete error dialog with Copy Details and Show Files.
- electron/native/wgc-capture/src/audio_sample_utils.cpp: timed silence advances the audio clock when loopback supplies no packets; pause/resume excludes pause gaps; Stop interrupts clock waits.
- electron/native/wgc-capture/src/main.cpp: shutdown-stage events identify stalls; failed encoder finalization now returns failure instead of announcing successful Stop.
- electron/windows.ts: delayed Studio/HUD load callbacks check both window and webContents destruction before accessing native objects. This fixes the screenshot's synchronous "TypeError: Object has been destroyed" in the Studio dom-ready CSS callback; a Promise catch alone did not catch that getter failure.

Explicit user discard still deletes a successfully stopped test/recording file. Save errors and pending finalization do not imply discard.

## Verification

- TypeScript no-emit check: passed.
- Biome check for 12 touched TypeScript files: passed.
- 35 focused unit tests across six files: passed.
- Native C++ regression: passed for silent queues, timeline start gate, pause/resume timestamps, and interruptible Stop.
- Windows source integration with native audio off and both hide options on: passed, including save, Studio close, and application lifecycle.
- Final Windows source integration with a controlled three-minute window, system audio on, and webcam/microphone off: passed, including finalized MP4, normal helper exit, complete JSONL log, Studio open, and clean Quit.
- Final capture: video 181.233317 seconds, audio 181.290646 seconds; Stop-to-Studio/probe checks completed in approximately 4.56 seconds.
- Final capture profile: C:\Users\DELL\AppData\Local\Temp\openscreen-finalization-vx3QLq.
- Native diagnostic log: recordings/recording-1789490186038.diagnostic.jsonl in that isolated profile.

An initial integration run saved a healthy 180-second MP4 but failed cleanup behind the destroyed-window exception dialog. It was not counted as a passing integration test. The isolated test process was terminated only after its native helper had exited and its video had saved. The guarded repeat passed cleanly.

## Timing

| Local Time | Work |
| --- | --- |
| 19:21-19:53 | Original damaged recording file creation/write interval |
| About 20:01 | Official Untrunc downloaded and release digest verified |
| About 20:03 | Resynchronization repair extracted video/audio packets from a copy |
| About 20:06 | Separate playable transcode produced |
| About 20:17-20:18 | Updated native helper compiled; native silence regression passed |
| 20:25-20:28 | First controlled three-minute capture saved; teardown exception discovered |
| About 20:31-20:33 | Exact destroyed-window callback guarded; dedicated regressions added and passed |
| About 20:37 | Complete 35-test focused unit suite passed |
| About 20:38 | Updated normal-main no-audio/hide lifecycle integration passed |
| 20:36-20:39 | Guarded repeat capture saved and source integration quit cleanly |

Default Node 24.13 test workers timed out while loading jsdom, and the Vite dev wrapper hit its compile timeout. The bundled newer Node runtime ran the unit tests successfully. For the final capture repeat, esbuild compiled an isolated dist-electron/main-verify.js source entry using external packages, while the renderer used the existing localhost:5174 server. The normal Vite-built main was also checked to contain the guard and passed the separate lifecycle integration.

## Remaining Limits

A complete half-hour soak test, microphone/webcam long-session matrix, and installed-binary/installer validation of these new fixes have not been performed. The original user's historical helper output is unavailable. Rebuilding and testing a new installer is the next release step; do not claim these changes shipped in 1.10.6.
