# Openscreen 1.10.30

## Auto-zoom follows what is being pointed at

The magic-wand and on-load auto-zoom were rewritten (`timeline/zoomSuggestionUtils.ts`):

- **Zooms last as long as the hold.** Each zoom now spans the cursor hold it comes from, plus a 0.6 s lead-in and a 0.3 s tail (minimum 2.5 s, maximum 25 s). Previously every suggestion was a fixed short window centred on the hold, so long explanations zoomed out halfway through.
- **Long holds are kept.** The old detector dropped holds over a few seconds as "idle", which threw away exactly the moments being explained. A hold now counts when the cursor arrived from somewhere (moved more than 10% of the frame in the 2.6 s before), or when the user clicked. A clicked hold counts from 0.8 s; an unclicked one needs 2 s.
- **Ignores parked cursors, edges and scrollbars.** Holds within 4% of the left, right or bottom edge are skipped, as is a cursor that never moved there.
- **Correct focus with padding.** The zoom focus is now converted from recording coordinates to the stage, using the actual layout (padding, aspect ratio and crop), and clamped so the zoomed view stays inside the recording. With padding 50 the old focus was off by up to 10% and could show the padding border.
- **Nothing inside trims.** A zoom that overlaps a trimmed section keeps only its longest untrimmed piece, or is dropped if that piece is under 2.5 s.
- **Budget.** At most 40% of the kept timeline is zoomed, with 1 s between zooms. The strongest holds (longest, clicked) win, and an over-budget hold is shortened rather than dropped.

## Export: encoder fallback instead of a late failure

- The H.264 encoder now tries the requested profile, then progressively more widely supported profiles (High 5.1/5.0/4.2, Main 4.2, Baseline 4.2), using the first configuration WebCodecs accepts. Previously an unsupported configuration (for example High 5.1 at 1080p60 on some Windows hardware encoders) failed the export.
- The MP4 metadata uses the codec actually chosen, and a fallback is logged.
- When both the software and hardware attempts fail, the reported error is the first real failure rather than a later "configuration not supported" message that hid the cause.

## Linux exports use AAC audio

- Chromium has no AAC encoder on Linux, so Linux exports were written with Opus audio inside MP4, which some editors and players reject. When WebCodecs cannot encode AAC, Openscreen now loads Mediabunny's WebAssembly AAC encoder (`@mediabunny/aac-encoder`, MPL-2.0) on demand and encodes AAC in software. Platforms with a native AAC encoder (Windows, macOS) are unchanged, and the module is not loaded there.
- Opus remains the fallback for sample rates AAC does not support.
- Mediabunny is updated from 1.40.1 to 1.61.3 (required by the extension).

## Portable projects

- Saved projects now also record each media path (screen, webcam, microphone) relative to the project file, in `media.relativePaths`. Absolute paths remain the primary reference.
- When a project is opened and a media file is missing at its absolute path, Openscreen looks for it at the stored relative path, then for a file of the same name next to the project. Windows paths are understood on Linux and vice versa, so a project folder copied between the Dell and the Z13 opens without relinking. Older projects without relative paths benefit from the same-name lookup.
- Lookups never leave the project folder (no `..`, no drive letters), the same folder the main process already trusts for project media. This applies to the editor's Open, recent-project and reload paths and to Studio MCP `studio_open_project`; `studio_save_copy` writes relative paths too.

## Linux packaging

- `package.json` now declares `homepage` and `description`. The deb target refused to build without a homepage, which stopped the 1.10.29 Linux build after the AppImage.
- The pacman package now declares Arch dependencies explicitly (`electron-builder.json5` `pacman.depends`). electron-builder's defaults included `http-parser` (removed from Arch) and `libappindicator-gtk3` (AUR only), so `pacman -U` refused to install it.

## Verification

- New tests:
  - auto-zoom (7): full-hold spans, long holds, parked and edge cursors, clicked short holds, trims, budget and gap;
  - focus mapping and clamp (5);
  - H.264 fallback order and error reporting (2);
  - AAC fallback selection (2), plus a real-browser test that writes an MP4 through the WebAssembly AAC encoder and reads the AAC track back;
  - portable paths (8): save, keep, relative, same name across platforms, legacy `videoPath`, containment.
- Full suite: 69 test files, 483 tests passed (1 skipped). Browser suite: 14 passed. `tsc --noEmit` clean. Biome: no new warnings.

## Build scope

Windows x64 installer, built with the `build:win` steps (`OPENSCREEN_BLURRY_SOURCE=D:/REPOS/Blurry`), electron-builder output on `D:\REPOS\openscreen-release\1.10.30`, with the installer, blockmap and `latest.yml` copied into `release\1.10.30`. Linux AppImage, deb and pacman packages are built on the Z13 from a source archive of this release. Existing releases and installed applications are preserved; nothing is installed automatically.

## Delivery

- Installer: `C:\REPOS\openscreen\release\1.10.30\Openscreen-Windows-x64-1.10.30-Installer.exe`
- Size: 346,651,038 bytes.
- SHA256: `FE3D84F3EC4CBD07B28AEA654655B50A6D66458CAA41E52301482370DD86B18F`
- Packaged executable version: 1.10.30.
- Packaged executable SHA256: `F80431089697AFB7EA0C3D6FE30703E4B7331E748416913C964B873DAEF368EF`
- Component manifest: studioMcp 1.0.0, captureEngine / blurry / cameraControls 1.10.30.
- Authenticode: NotSigned; Windows may display an unsigned-publisher warning.
- Linux packages (built on the Z13, copied into `release\1.10.30`): `Openscreen-Linux-1.10.30.AppImage` (336,487,520 bytes), `.deb` (269,465,960 bytes), `.pacman` (239,822,752 bytes, Arch-correct dependencies). No `latest-linux.yml` was produced.
- The `homepage`/`description` metadata was added after the Windows installer was built; it affects Linux packaging only.
