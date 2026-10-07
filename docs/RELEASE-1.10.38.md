# Openscreen 1.10.38

## Batch export from the app

- New **Batch export** button in the editor's top bar. It opens a dialog that runs the command-line batch exporter (`--export-dir`) for you:
  - **Projects folder** and **Save videos to**, with folder pickers. They default to the current project's folder and its `exports` subfolder, and are remembered.
  - **Only projects matching** (default `*_done`) and **Skip projects matching** (for example `*p2_done`). Shell-style patterns, comma or space separated.
  - **Quality** (720p, 1080p or source) and **Replace existing videos**.
  - A live list of the projects that will be exported. Projects whose video already exists show as *already exported* unless Replace is on.
  - **Export N projects** starts the batch. Each project shows a progress bar, then a tick with its time or a cross with the error, followed by a summary. **Stop** cancels the run.
- The batch runs as a separate, hidden Openscreen process with its own temporary profile, so the editor stays usable. Closing the dialog (**Hide**) does not stop it, and reopening shows the progress.
- Command line: the new `--progress-json` option prints machine-readable progress events, which the dialog reads. The normal text output is unchanged.

## Export panel no longer covers the icon menu

- The Export panel's options (format, resolution, audio, smooth cuts, GIF settings) lived in the panel's fixed footer. Once the audio and smooth-cut options were added they made it taller than the space available, and it was drawn over the icon menu on the left (Background, Effects, Layout, Crop…). The options now sit in the panel's scrollable area, and only the **Export** button stays pinned at the bottom, so the menu stays visible and clickable for going back to change the background, zoom and so on.

## Also included (1.10.37)

- The project name, unsaved marker, export progress and a Studio badge in the editor's top bar.

## Verification

- New tests:
  - batch command arguments (filters, quality, overwrite, JSON progress, separate profile, development app path) and pattern splitting;
  - progress events: the JSON round trip, ignoring non-event output, and the unchanged text output;
  - the dialog's state: queued, running, done or failed, skipped, cancelled, and a process that stopped early.
- End to end on Windows: the exact command the dialog starts (development build, `--progress-json`, separate profile) exported a test project. It reported start → job → encoder and audio diagnostics → done in 88 s → summary, and wrote the MP4.
- On the Z13 the packaged Linux build ran the same command with its own profile and reported a correct start event: all seven `_done` exports already exist, so they were listed as skipped.
- Full suite: 80 test files, 537 tests passed (1 skipped). Browser suite: 20 of 21 passed in the full run. The known flaky `recordingSync.browser.test.ts` failed once, then passed twice on its own. `tsc --noEmit` clean. Biome: no new warnings. i18n: the new strings are in all 13 locales.
- The dialog and the new Export panel layout were not clicked through in the running app: Studio cannot open dialogs or panels, and desktop control cannot target the Electron window.

## Build scope

Windows x64 installer and Linux AppImage, deb and pacman packages, built from the same source.

## Delivery

- Windows installer: `C:\REPOS\openscreen\release\1.10.38\Openscreen-Windows-x64-1.10.38-Installer.exe`, 346,681,528 bytes, SHA256 `3614771FBDB2C8F7BCA2F09E4BFECE655381959186B4552B963EA8496759729C`. Packaged executable version 1.10.38. Authenticode: NotSigned.
- Linux, built on the Z13 from the same source:
  - `Openscreen-Linux-1.10.38.pacman`, 239,675,424 bytes, SHA256 `7AE9D36C7E346720832E697A120102B7AEB4ABCF9F316638A9B7972E73E459F2`; `pacman -Up` resolves all dependencies;
  - `.deb`, 269,100,840 bytes, SHA256 `19BE204700F4E833B3785ED03603A0C085608540FF3C5CC31CF3F1CDEBA19F52`;
  - `.AppImage`, 336,397,481 bytes, SHA256 `BC235BEEA29211ABF0419FC87D831C29ABA549F186D3FE4A13138AC839B9F2AF`.
- Component manifest: studioMcp 1.0.0, captureEngine / blurry / cameraControls 1.10.38.
