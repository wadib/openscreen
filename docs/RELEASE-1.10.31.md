# Openscreen 1.10.31

Seven upgrades that move the manual post-production steps (pause and filler cleanup, mic sync, audio polish, smooth cuts, batch rendering) into Openscreen itself.

## 1. Clean up pauses and filler words

- New **Clean up** button in the timeline toolbar. It shortens long pauses and removes filler words ("um", "uh", "em", "erm", "hmm", …) by adding ordinary trims, as one undoable step, so every cut can be reviewed or adjusted on the timeline. Original media is untouched.
- **Pauses:** silences longer than 0.5, 0.8 (default), 1.2 or 2 s are shortened, keeping 150 ms of silence on each side so speech keeps its rhythm. The silence threshold adapts to each recording's noise floor.
- **Filler words** can be found in two ways:
  - on this computer with the bundled Whisper model, which is private and offline but misses many fillers;
  - with a CrisperWhisper server, a verbatim model that keeps fillers. The server URL is configurable, and defaults to the Z13 server at `http://192.168.86.250:8080/`.
- When the project has a separate microphone track, cleanup analyses that track and maps the cuts onto the screen timeline using the mic offset. New cuts merge with near neighbours, skip what existing trims already remove, and drop slivers under 120 ms.
- The result toast reports the number of cuts, the seconds removed, and how many were pauses and how many fillers.

## 2. Automatic microphone sync

- New **Auto** button next to the microphone Sync field. It cross-correlates onset envelopes (FFT, 1 ms resolution) between the mic and a reference that heard the same voice, then sets the offset. The reference is the webcam audio if there is any, otherwise the screen recording's audio.
- The offset is applied only when the match is reliable. It also measures the end of long recordings and warns when the tracks drift.
- Verified on a real recording (p4): the original mic measured +34 ms against the synced screen audio, and a copy delayed by exactly 437 ms measured −403 ms (Δ 437 ms). Confidence was about 70σ against a threshold of 8σ, and each measurement took about 0.25 s.

## 3. Audio enhancement on export

- New Audio switches in the Export panel, saved per project:
  - **Normalize loudness**: BS.1770-4 integrated loudness with the exact K-weighting filters, normalised to −16 LUFS with a look-ahead peak limiter at −1 dBFS and make-up passes;
  - **Reduce background noise**: a downward expander that lowers the room tone between words by up to 12 dB without touching speech;
  - **Remove low rumble**: an 80 Hz high-pass.
- Applied to the final mix (system audio + microphone, after trims) in every audio path, including speed regions.
- Verified: a real export measured **−16.0 LUFS** with ffmpeg `ebur128`, peaking at −3.1 dBFS. The same project without enhancement measured −15.4 LUFS.

## 4. Smooth cuts (crossfades)

- New **Smooth cuts** setting in the Export panel: Off (default), 0.1 s, 0.25 s or 0.5 s.
- At each trim cut the last frame before the cut dissolves into the new footage, and the audio crossfades with an equal-power curve. The outgoing audio runs on briefly into the trimmed part while the new audio fades in.
- Output length and A/V sync are unchanged.
- Verified on a real export: frames before the cut and 0.35 s after it are identical to a hard-cut export (PSNR 57 dB, which is encoding noise). The frames in between are blends that contain the outgoing picture.

## 5. Command-line export and batch queue

- `Openscreen --export project.openscreen out.mp4` (repeatable) and `Openscreen --export-dir <folder> <outdir>` render projects headlessly, one after another, in a hidden editor window with the normal export pipeline.
- Options: `--quality medium|good|source`, `--overwrite` (otherwise existing outputs are skipped, so an interrupted batch can be re-run) and `--show`.
- Progress, encoder and frame-path diagnostics, and a summary go to stdout. Exit codes: 0 when everything exported, 1 when a job failed, 2 for a usage error.
- See `docs/CLI_EXPORT.md`. This replaces the hand-written Z13 export scripts.
- Verified on Windows with a real 30 s project: the export finished in about 50 s with exit 0, and existing outputs were skipped as expected. Verified on the Z13 with p2b_done (see 7).
- Production builds strip console output, so exporter diagnostics now go through a small channel (`exportDiagnostics.ts`) that the command line prints.

## 6. Zoom review panel

- New **Review zooms** button in the timeline toolbar. It lists every zoom in order with a thumbnail of the recording at the zoom's midpoint and a green box outlining what the zoom shows (mapped through padding and layout). Each row also shows the time range, duration, scale and whether the zoom is auto or manual.
- Click a thumbnail to select the zoom and jump to it, or delete it from the list.

## 7. Faster Linux exports

- Investigated hardware H.264 encoding on the Z13 (Radeon 8060S): ffmpeg's VA-API encoder works there, but Electron 41's Chromium exposes no AMD hardware encode profiles under any flag combination tested (`AcceleratedVideoEncoder`, `VaapiIgnoreDriverChecks`, Wayland or X11, ANGLE GL or Vulkan). Software H.264 encoding already runs at about 300–400 fps for 1080p, so the encoder was not the bottleneck.
- The real cost was the Linux CPU readback workaround for empty GPU frames, which made three readbacks per frame. On the Z13 with Electron 41, a direct WebGL-to-`VideoFrame` path took 41 ms for 120 1080p frames against 635 ms with readback, and the encoded and decoded frames were correct.
- Linux exports now use the direct GPU path. The first frame of every export is verified both ways: direct WebGL draw against readback, and the encoder frame against the canvas pixels. If either check differs, the export falls back to readback automatically, so machines that need the workaround keep it.
- **Measured on the Z13:** p2b_done (1080p60, 6,480 frames, quality "good") exported in **25 s**, against about 2 min with 1.10.30, roughly 4.8× faster. p3a_done (25,091 frames, 7 minutes) exported in **148 s** against 415 s, 2.8× faster. The p2b output has the same frame count and duration as the 1.10.30 export, with an average PSNR of 43.4 dB against it (the same picture, re-encoded), and AAC audio instead of Opus.

## Verification

- New tests:
  - speech cleanup (7);
  - audio sync and FFT (5);
  - audio enhancement (6, real Chromium);
  - audio crossfade (1, real Chromium);
  - cut crossfade (3);
  - CLI parsing and job resolution (5).
- Full suite: 73 test files, 503 tests passed (1 skipped). Browser suite: 7 files, 21 tests passed. `tsc --noEmit` clean. Biome: no new warnings. i18n: the new strings are in all 13 locales, with placeholders checked; the existing gaps in `dialogs.json` and `launch.json` are unchanged.
- Real-data checks: the sync and pause measurements above; command-line exports with enhancement and smooth cuts checked with ffprobe, ffmpeg `ebur128` and PSNR.
- Known flaky test: `recordingSync.browser.test.ts` records in real time and occasionally counts one tone more or fewer (for example 6 against 7). It failed intermittently before these changes too, during 1.10.30. In the final runs it passed 2 of 3 times on its own. Its export uses the same mixing path as before (enhancement and smooth cuts off).

## Build scope

Windows x64 installer and Linux AppImage, deb and pacman packages, built from the same source. Existing releases and installed applications are preserved; nothing is installed automatically.

## Delivery

- Windows installer: `C:\REPOS\openscreen\release\1.10.31\Openscreen-Windows-x64-1.10.31-Installer.exe`, 346,668,405 bytes, SHA256 `59C2BBF40E7E355D6B732E8C400345563512DF6574247516FB9F650B59BBD3C2`. Packaged executable version 1.10.31, SHA256 `FADCACFB6FDCE51BEB7B80E468B711BBD933BFEBEF2C9975C78B011E11A76FB4`. Authenticode: NotSigned.
- Linux, built on the Z13 from the same source:
  - `Openscreen-Linux-1.10.31.pacman`, 239,668,608 bytes, SHA256 `BE6DDD39A712D1EC0BDB7C666034F7D932EC65A41AFB9702666CE88B1D84396F`;
  - `.deb`, 269,082,980 bytes, SHA256 `6F30235EC1BCA0160AF5D38AEB206242BF0D1563243C1922AB3441637C57D671`;
  - `.AppImage`, 336,381,365 bytes, SHA256 `3355348C448F9BF615EDE00B8B20EF8CDB4DF7E3A8E1CAF45D082EF9886B5E99`.
- Component manifest: studioMcp 1.0.0, captureEngine / blurry / cameraControls 1.10.31.
