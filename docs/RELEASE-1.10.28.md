# Openscreen 1.10.28

## Sidecar timeline check

- When a recording is saved, each streamed webcam and microphone WebM is now checked before its Duration header is written. If the file's last media cluster starts more than 5 s past the session length, the track kept recording while the session was paused (the webcam-through-pause fault fixed in 1.10.25) and will drift against the screen.
- Previously the duration patch wrote the session length into the header regardless, which hid the drift: an affected 1.10.13 webcam reported 4:04 while holding 6:35 of frames.
- A mismatch now logs a console warning and appends a `sidecar-timeline-mismatch` event (track, path, last cluster time, declared duration, overrun) to the recording's `.diagnostic.jsonl`, so damaged recordings can be found and repaired.

## Pause toggle

- Native Windows and macOS pause/resume wait for the main process. A second toggle during that wait (for example pressing Ctrl+Shift+P twice quickly) read the stale paused flag and repeated the pause instead of resuming. Further toggles are now ignored until the pending one completes.

## Verification

- New unit tests: `electron/recording/webm-duration.test.ts` (cluster timecode parsing, mismatch and tolerance cases) and a `useScreenRecorder` test for a double toggle while the native pause is in flight.
- The detector run against a real affected 1.10.13 webcam recording reported last cluster 390,544 ms against a declared 244,175 ms (mismatch).
- Full suite: 65 test files, 453 tests passed (1 skipped). `tsc --noEmit` clean.

## Build scope

Windows x64 installer, built with `npm run build:win` (`OPENSCREEN_BLURRY_SOURCE=D:/REPOS/Blurry`). Existing releases and the installed application are preserved; nothing is installed automatically. Also contains the unreleased working-tree changes present at build time (Settings app info and update check).

## Delivery

- Installer: `C:\REPOS\openscreen\release\1.10.28\Openscreen-Windows-x64-1.10.28-Installer.exe`
- Size: 345,234,048 bytes.
- SHA256: `8E54C0D9507601DD41E870BE0557F92BF75117190483F5622C7DE713CEAF6A73`
- Packaged executable version: 1.10.28.
- Packaged executable SHA256: `9BC99330F941B90F0649E26F003C7D646C421C84355A17AD2D86981F0202F8FB`
- Bundled WGC helper SHA256: `F248A33232D218FEE8EFD4E193D6E38D33F5EB7A3E6AE9283A05AFAC08AE5E37`
- Component manifest: studioMcp 1.0.0, captureEngine / blurry / cameraControls 1.10.28.
- Authenticode: NotSigned; Windows may display an unsigned-publisher warning.
