# Openscreen 1.10.33

## Quieter, more targeted command-line batches

- **`--only` and `--exclude` for `--export-dir`.** Shell-style patterns (`*`, `?`, case-insensitive, `.openscreen` optional) select which projects in a folder are exported, for example only the finished ones:

  ```bash
  openscreen --ozone-platform=wayland --export-dir ~/Videos/Openscreen ~/Videos/Openscreen/exports --only "*_done" --exclude "*p2_done"
  ```

  Both options can be repeated. Previously `--export-dir` exported every project in the folder, including intermediate `_clean` and `_final` versions.
- **No failed hardware attempt on Linux.** Chromium on Linux exposes no hardware H.264 encoder, so every Linux export began with "prefer-hardware attempt failed … retrying" before falling back. Linux now tries software first, as Windows already did; hardware remains the fallback. macOS keeps hardware first.
- The `[OpenH264] Warning: …` lines on Linux come from Chromium's software encoder itself and are harmless; `docs/CLI_EXPORT.md` now says so.

## Verification

- New tests: encoder order per platform; pattern matching (wildcards, extension optional, special characters treated literally); `--only` and `--exclude` applied to `--export-dir`.
- Full suite: 75 test files, 513 tests passed (1 skipped). Browser suite: 20 of 21 passed in the full run. The known flaky `recordingSync.browser.test.ts` failed once, then passed twice on its own. `tsc --noEmit` clean. Biome: no new warnings.
- On the Z13, `--export-dir ~/Videos/Openscreen … --only "*_done" --exclude "*p2_done"` selected exactly the 7 finished projects (p2b, p3a, p3b, p4, p5, p6, p7). Their outputs already existed, so all 7 were skipped.

## Build scope

Windows x64 installer and Linux AppImage, deb and pacman packages, built from the same source. Existing releases and installed applications are preserved; nothing is installed automatically.

## Delivery

- Windows installer: `C:\REPOS\openscreen\release\1.10.33\Openscreen-Windows-x64-1.10.33-Installer.exe`, 346,671,370 bytes, SHA256 `FE78DF0843B233C57FAFD48821D22B930D31566B9B5E99252B7F40E9F74A7E62`. Packaged executable version 1.10.33. Authenticode: NotSigned.
- Linux, built on the Z13 from the same source:
  - `Openscreen-Linux-1.10.33.pacman`, 239,701,816 bytes, SHA256 `5341B38AB6011F89151FFDFD84AEB02E373813A3C0993984B8DFDD746EDD7581`; `pacman -Up` resolves all dependencies;
  - `.deb`, 269,087,692 bytes, SHA256 `5B188B591A5F02945EC1CC7533460CD29E13C96B9A768D1B907FAEDFD576F2B2`;
  - `.AppImage`, 336,385,621 bytes, SHA256 `44D368CBB86A95A963B9A56DD8219A0348D0D9F1E2BAC4E7EA017D35089D6595`.
- Component manifest: studioMcp 1.0.0, captureEngine / blurry / cameraControls 1.10.33.
