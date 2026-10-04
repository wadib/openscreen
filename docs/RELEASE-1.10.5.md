# Openscreen 1.10.5

## Countdown

The existing 1.10.4 package rendered 3-2-1 in an isolated check, but the
countdown was unconditionally positioned on the primary display. It now
centers on the recording controls' display on every show and uses their
screen-saver topmost level, without taking focus or intercepting mouse input.
The preload retains the most recent countdown value so a late React
subscription does not miss the initial number. The three-second timing remains.

## Studio And Hide Options

Closing Studio no longer leaves the app without windows and triggers Quit.
It replaces Studio with the recorder first, then closes Studio. The existing
save/discard/cancel confirmation remains on the close path. Explicit Quit
still closes the app rather than creating another recorder.

The hide-after-video preference controls whether the replacement recorder is
visible. Dismiss and other Studio/recorder transitions also create the replacement
before closing the old window. Hiding leaves the app available from its tray.

Both hide flags were checked against actual BrowserWindow visibility with
enabled and disabled settings. No separate checkbox-persistence defect was
reproduced; existing post-recording and saved-video visibility handlers remain.

## Source Validation

All timing below is 2026-09-15, Asia/Dubai (UTC+04).

- TypeScript and scoped Biome checks passed.
- Eight focused recording tests passed at 14:49:19, duration 23.98 seconds,
  including countdown 3-2-1, hide-before-native-start ordering and cancellation.
  Native start is mocked in these unit tests.
- Three source Electron UI tests passed in 1.2 minutes: countdown on a secondary
  monitor, repeat show/hide and cached value for late subscription; and enabled
  and disabled hide settings for finish-recording, saved-video notification,
  dismiss, and closing Studio while the app remains ready.
- UI lifecycle tests use an isolated preference file and a saved-file fixture;
  they do not record or export a real video. The existing actual-export test is
  separate. The countdown screenshot was visually inspected.
- Two earlier development runner attempts exceeded its 30-second compiler
  startup allowance. The allowance is now 120 seconds; the final main build
  took 46.80 seconds. The test assertions were not relaxed.
- Countdown artifacts:
  C:/Users/DELL/AppData/Local/Temp/openscreen-countdown-LfJ70w
- Visible lifecycle artifacts:
  C:/Users/DELL/AppData/Local/Temp/openscreen-window-lifecycle-2H5JLA
- Hidden lifecycle artifacts:
  C:/Users/DELL/AppData/Local/Temp/openscreen-window-lifecycle-Obj1D1

## Scope

Windows installer build started approximately 14:55. Earlier releases, the
installed copy and the running development app remain intact. No installation,
commit, push or tag was requested. macOS/Linux share these Electron code paths
but were not executed on this Windows host.

## Packaged Validation

- The complete Windows x64 build passed, including native helper preparation,
  original Blurry, TypeScript, production bundles, NSIS installer and block map.
- Five packaged Electron checks passed together in 1.0 minute: countdown plus
  all four independent combinations of hide-after-recording and hide-after-video.
  Studio close/dismiss produced the expected visible or hidden recorder without
  quitting. Each lifecycle case also verified explicit Quit closes the app.
- The both-enabled case used the real recording controls and countdown, recorded
  a controlled native Windows window with audio and webcam disabled, then stopped.
  The saved MP4 had more than 1 KB and an ftyp header. Post-stop Studio remained
  hidden as requested. The controlled capture window was destroyed before the
  later Studio close check, so it did not keep the app alive artificially.
- Saved-video notification tests use a file fixture and exercise actual IPC
  visibility handling, not the complete renderer export-button workflow.
  No real OS quiet-mode transition was requested or tested in this release.
- Packaged countdown screenshot visually inspected:
  C:/Users/DELL/AppData/Local/Temp/openscreen-countdown-IP6F5E/countdown-3.png
- Packaged lifecycle artifacts, in flag order (recording, video):
  false/false: C:/Users/DELL/AppData/Local/Temp/openscreen-window-lifecycle-K1zL21
  false/true: C:/Users/DELL/AppData/Local/Temp/openscreen-window-lifecycle-7yOhDr
  true/false: C:/Users/DELL/AppData/Local/Temp/openscreen-window-lifecycle-Pc1EjN
  true/true: C:/Users/DELL/AppData/Local/Temp/openscreen-window-lifecycle-uCxqIF
- Final metadata verification completed 15:05:52.

## Delivery

- Installer: D:/REPOS/openscreen/release/1.10.5/Openscreen-Windows-x64-1.10.5-Installer.exe
  Written 15:05:32; 345,137,317 bytes; product version 1.10.5.
  SHA256: 8263D255CEB73E492C73F393CF0260974CD4394173A19C33A076AA4CD5CDC5C1
- Portable: D:/REPOS/openscreen/release/1.10.5/win-unpacked/Openscreen.exe
  Written 15:03:08; 223,286,272 bytes; product version 1.10.5.0.
  SHA256: 4910F1FC00EB947161CBDEDA8CDBB80E6B818AAD781ED2F9DFC2FCD71F76BACA
- Authenticode inspection reports NotSigned for both artifacts. Signing log
  steps do not indicate that a publisher signature was actually applied.
- Installing is a separate user action; the running and installed copies were
  not replaced or shut down automatically.
