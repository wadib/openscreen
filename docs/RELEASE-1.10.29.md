# Openscreen 1.10.29

## Exports with a separate microphone track

- Exports of projects that use a separate microphone track (sidecar WebM/WAV, as recorded by 1.10.17+ or attached in Studio) could render every frame and then fail at the very end. On Linux the diagnostic read "Timestamps cannot be smaller than the largest timestamp of the previous GOP … Got 4.010667s, but largest timestamp is 4.012s"; on Windows the software attempt failed the same way and the hardware fallback then reported "Hardware video encoding is not supported on this system".
- Cause: when the audio encoder fell behind, `encodeAudioBuffer` flushed it mid-stream to relieve backpressure. A flush pads the encoder's partial frame and resets it, so the next chunk started before the padded one ended and the MP4 muxer rejected the non-monotonic timestamps. It only triggered once the encode queue filled, which is why short exports worked.
- The encoder now waits for its queue to drain instead of flushing; the only flush is at the end of the stream.

## Studio MCP

- New `studio_close` tool. Studio intentionally outlives a disconnected agent so no work is lost, which meant every scripted session left a window behind. `studio_close` ends the agent-only instance; it refuses while an export is running or while edits are unsaved (unless `discardUnsaved: true`). It never touches the normal recorder.
- The Studio window title now names the open project and shows export progress (for example `Openscreen Studio — recording-…_p6_done · exporting 42%`), so several instances can be told apart from the taskbar.
- `docs/STUDIO_MCP.md` documents `studio_close` and the `exportError` diagnostic.

## Verification

- New tests: a deterministic unit test with an encoder that falls behind (fails on 1.10.28 with the exact muxer error, passes now), a real-WebCodecs browser test encoding 60 s of audio, `studio_close` server tests (close, refusal over unsaved edits, forced discard) and window-title tests.
- Full suite: 66 test files, 459 tests passed (1 skipped). `tsc --noEmit` clean. Studio MCP end-to-end test passed against the built app, including `studio_close` being refused during an export.

## Build scope

Windows x64 installer, built with the `build:win` steps (`OPENSCREEN_BLURRY_SOURCE=D:/REPOS/Blurry`). Because C: was nearly full, electron-builder wrote its output (including `win-unpacked`) to `D:\REPOS\openscreen-release\1.10.29`; the installer, blockmap and `latest.yml` were then copied into `release\1.10.29` next to the component manifest. Existing releases and the installed application are preserved; nothing is installed automatically.

## Delivery

- Installer: `C:\REPOS\openscreen\release\1.10.29\Openscreen-Windows-x64-1.10.29-Installer.exe`
- Size: 345,233,211 bytes.
- SHA256: `ED23BFD20246FCF0A561E0E2867D5E17630DF5DA30C1C450A02BD3BC6970F7ED`
- Packaged executable version: 1.10.29.
- Packaged executable SHA256: `679E1487A3CC8DBD033CFBA66FF86B3BD331CC150232D788DCD0CC16B53C3042`
- Bundled WGC helper SHA256: `F248A33232D218FEE8EFD4E193D6E38D33F5EB7A3E6AE9283A05AFAC08AE5E37` (unchanged from 1.10.28)
- Component manifest: studioMcp 1.0.0, captureEngine / blurry / cameraControls 1.10.29.
- Authenticode: NotSigned; Windows may display an unsigned-publisher warning.
- Installed application remains version 1.10.27.
