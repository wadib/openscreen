# Windows Audio Sync Correction - 2026-09-15

## Report

After delivery of 1.10.7, the user reported audio drifting increasingly out of sync and identified the microphone as the affected input.

## Source Changes

The native mixer previously ignored device packet timestamps and consumed samples from arrival-ordered byte queues. Timing gaps filled by its independent clock could therefore change the position of later captured content. The loopback path also inserted device-gap silence into those queues after the mixer might already have emitted silence. This is a demonstrated architectural timing problem; without the user's failing recording and corresponding diagnostics, its precise contribution to their microphone drift is not conclusively established.

WASAPI packet timestamps now propagate to the mixer. Timestamped queues place microphone and system samples at their capture-time positions, preserve silence gaps and discard already-past packets rather than shifting subsequent sound. Screen video and separate webcam video use the same performance-counter recording epoch, including pause time; the encoder no longer independently rebases video to its first sample.

Windows provides the packet's QPC timestamp in 100-nanosecond units: [Microsoft GetBuffer documentation](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer). Invalid device timestamps fall back to current QPC minus packet duration.

The mixer has a fixed 250 ms delivery look-ahead without shifting MP4 timestamps. Stop flushes buffered timeline samples. Per-record diagnostics include packet counts, discarded packets and maximum observed delivery latency.

## Verification

- Windows C++ helper compiled successfully.
- Native tests pass for silent clock advancement, start gating, pause/resume, interruptible Stop, sparse sound positions across a simulated half hour, stale/partial packets, and 44.1 kHz mono microphone packets resampled to 48 kHz stereo and delivered out of order. Buffered microphone tail flushing is also checked.
- Real Windows system-loopback screen/flash-and-tone test passed using the rebuilt helper override with an isolated 1.10.7 app profile. Seven tones were detected after repeated audio-renderer suspension between tones. Sound-minus-flash offsets were 76.7, 76.7, 43.3, 53.3, 96.7, 76.7 and 53.3 ms: spread 53.3 ms, no progressively increasing offset during this approximately 54-second recording. This is not a physical microphone or half-hour hardware soak test.
- Evidence: release/1.10.7/validation/openscreen-av-sync-sqPkxf/recordings/recording-1789497387315.mp4 and its diagnostic JSONL.
- Initial tone-test runs failed because a fixed energy threshold exceeded this machine's low-volume output; adaptive detection corrected the test. Those failures are not evidence that the original 50 ms delivery look-ahead lost sound, and a larger look-ahead's necessity on this machine is not established.
- TypeScript and scoped Biome checks passed.
- The final microphone tail-flush regression passed; strict full-file FFmpeg decoding of the successful sync recording also passed.

## Delivery State

These are source/native-helper changes after the 1.10.7 installer build. The installer and packaged helper in release/1.10.7 remain unchanged; the new helper is in electron/native/bin/win32-x64/wgc-capture.exe. Installed Openscreen was not modified or closed. No new installer, commit or push is claimed by this investigation.

Work and verification took place on 2026-09-15, UAE local time (UTC+04:00), ending around 22:39.
