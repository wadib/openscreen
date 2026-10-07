# Openscreen 1.10.36

## Timeline follows the playhead

- During playback the playhead used to run off the right edge of a zoomed-in timeline, and the timeline never moved, so following along meant scrolling by hand.
- New **Follow** toggle in the timeline toolbar, on by default and remembered between sessions. While the preview plays, when the playhead reaches the right edge the timeline turns the page so the playhead is near the left edge again. It also brings the playhead back into view if it is left of the visible window. The zoom level is kept.
- Nothing moves while paused, so scrolling and panning by hand to inspect another part of the timeline is not interrupted. When the whole timeline is visible there is nothing to follow.

## Verification

- New tests: playhead in view (no change), page turn at the right edge, playhead left of the view, clamping at both ends, whole timeline visible.
- Full suite: 77 test files, 525 tests passed (1 skipped). Browser suite: 7 files, 21 tests passed. `tsc --noEmit` clean. Biome: no new warnings. i18n: the new strings are in all 13 locales.

## Build scope

Windows x64 installer and Linux AppImage, deb and pacman packages, built from the same source. Includes everything in 1.10.35 (transcript lane, labelled lanes, cut shading).

## Delivery

- Windows installer: `C:\REPOS\openscreen\release\1.10.36\Openscreen-Windows-x64-1.10.36-Installer.exe`, 346,675,772 bytes, SHA256 `E3CC7100EAF4EA61C734EC2F13ED78CC030C1404B824681D15BC06860F69EA72`. Packaged executable version 1.10.36. Authenticode: NotSigned.
- Linux, built on the Z13 from the same source:
  - `Openscreen-Linux-1.10.36.pacman`, 239,693,048 bytes, SHA256 `0F811F2D005F7E7584219EE1CC8BBF3810E26758D7044A976D6A9E8A32299454`; `pacman -Up` resolves all dependencies;
  - `.deb`, 269,095,588 bytes, SHA256 `EE337104FDCEA57200F680A47A93F8DA31200D00B151C9C9B1A2C4F474B7A160`;
  - `.AppImage`, 336,393,799 bytes, SHA256 `3F83BD87B356C6A58A72243344A1755ABC66DD7AB135C7D6CE165689EE058F8D`.
- Component manifest: studioMcp 1.0.0, captureEngine / blurry / cameraControls 1.10.36.
