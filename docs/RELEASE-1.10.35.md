# Openscreen 1.10.35

## Transcript lane under the zooms

- New **Transcript** lane directly under the **Zoom** lane. It shows what is being said as short phrases on the timeline, so zooms can be placed and checked against the narration without playing the audio.
- Phrases break at pauses (400 ms or more), at sentence ends and after 10 words. When the timeline is zoomed out, neighbouring phrases merge into wider blocks (at least about 90 px) so the text stays readable at any zoom level. Hovering shows the full text; clicking a phrase moves the playhead there.
- Speech inside trimmed sections is drawn red and struck through. When zoomed out it only appears once it is wide enough to read; the cut shading still marks where it is.
- **Transcribe / Redo** in the lane's label creates the transcript. It uses the CrisperWhisper server when it answers (accurate word timings, keeps "uh/um"), otherwise the built-in Whisper model. It transcribes the separate microphone track when there is one, shifted by the microphone offset, and the screen audio otherwise.
- The transcript is saved with the project (`editor.transcript`: words with millisecond timings). It is not part of the undo history and does not change the export.

## Timeline lanes

- Every lane now has a **label column** on the left: Zoom, Transcript, Mic, Trim, Text, Blur and Speed. The empty-lane hints, the waveforms, clicking and scrubbing are all offset by the label column, and clicks on a label do not seek.
- **Cut sections are shaded in every lane** with red hatching, not only in the Trim lane, so the lanes show what ends up in the final video.

## Projects

- The seven tutorial projects on the Z13 (`~/Videos/Openscreen/*_done.openscreen`) received their CrisperWhisper transcripts from the earlier cleanup work. Alignment was checked on each: most "uh/um" fillers fall inside the project's trims (36/39 for p2, 78/82 for p3a, 48/56 for p4, and so on). The backup is `~/osx/out/projects-backup-before-transcripts.tgz`. Older Openscreen versions ignore the transcript and drop it when saving, so open these projects with 1.10.35 or later.

## Known issue (not new)

- Opening a project in Studio MCP marks it as having unsaved changes right after loading (revision 2), with or without a transcript. This predates 1.10.35 and will be looked at separately.

## Verification

- New tests: transcript normalisation, conversion from seconds with the microphone offset, phrase building (pauses, sentence ends, long runs, cut speech), zoom-out merging and visible-range filtering.
- Checked in the running app (Studio) with the p4 project and its 986-word transcript: the labelled lanes, the transcript readable at the full 6:25 view under the matching zooms, and cut hatching across the lanes.
- Full suite: 76 test files, 520 tests passed (1 skipped). Browser suite: 7 files, 21 tests passed. `tsc --noEmit` clean. Biome: no new warnings. i18n: the new strings are in all 13 locales; the existing gaps are unchanged.

## Build scope

Windows x64 installer and Linux AppImage, deb and pacman packages, built from the same source.

## Delivery

- Windows installer: `C:\REPOS\openscreen\release\1.10.35\Openscreen-Windows-x64-1.10.35-Installer.exe`, 346,674,905 bytes, SHA256 `86AFACC0503B0F66E3709A8B886CCE61C4D21E01B990FFD99265861DB0B4C39F`. Packaged executable version 1.10.35. Authenticode: NotSigned.
- Linux, built on the Z13 from the same source:
  - `Openscreen-Linux-1.10.35.pacman`, 239,678,632 bytes, SHA256 `33396E59F9B239E40FE792FD37DFC335BB9630405816301F47E49F0E473B43B2`; `pacman -Up` resolves all dependencies;
  - `.deb`, 269,093,268 bytes, SHA256 `A11D39451CFCE2E8670738B4E51B24BAE431D4D51EC5B53844809E0D9FA345E5`;
  - `.AppImage`, 336,393,933 bytes, SHA256 `BE7AEE18FC07D3052D01DDED667481B01701E171F61144754F5FFDDB67DE05E5`.
- Component manifest: studioMcp 1.0.0, captureEngine / blurry / cameraControls 1.10.35.
