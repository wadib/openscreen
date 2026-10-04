# Openscreen 1.10.3

## Preview Startup

Reported 2026-09-15: Preview unavailable for both monitor and window modes.
The running user app was the 1.10.2 portable executable, not Program Files.

An isolated packaged viewer test reproduced a first-show failure:
Recording preview capture exclusion failed. A separate isolated native-window
probe returned false immediately after setting protection and showing the
window, but true after waiting 500 ms and applying protection again.
The bundled preview helper separately produced frames on all six monitors.

The viewer now waits for confirmed capture protection for up to two seconds,
retrying every 25 ms. It remains invisible and click-through during this wait,
and does not load viewer content until protection succeeds. Failed protection
or closure still fails closed and destroys the pending window.
The toggle IPC awaits initialization rather than reporting success early.

This fixes the reproduced startup race, not every possible native capture
failure. Closed or unavailable sources still use the existing unavailable and
retry behavior. Native MP4 recording, original Blurry settings, docking,
preview layout, cursor behavior and webcam sharing were not redesigned.

## Source Validation

All timing below is 2026-09-15, Asia/Dubai (UTC+04).

- Three focused unit files passed: 19 tests, including immediate and delayed
  protection, timeout, initialization cancellation and existing preview capture
  and hook behavior. Started 12:16:00; duration 21.31 seconds.
- TypeScript passed; scoped Biome checks and tracked-file diff checks passed.
- Source viewer integration passed in 1.1 minutes, including changing pixels,
  source resize/switch, cursor visibility, webcam playback, direct Windows
  display affinity, minimize/restore, close/reopen during native MP4 recording
  and valid saved video. Compact webcam screenshot visually inspected.
  Artifacts: C:/Users/DELL/AppData/Local/Temp/openscreen-recording-preview-cApzHU
- Source full-monitor test passed on all six connected displays in 36.5 seconds.
  Artifacts: C:/Users/DELL/AppData/Local/Temp/openscreen-monitor-preview-g9n8hY
- The final monitor test also requires normal visible-window startup without
  test-forced opacity. Final packaged validation is recorded below.

## Scope

Windows viewer only. macOS/Linux preview remains intentionally unavailable
until equivalent capture exclusion is implemented and tested.
Earlier releases and the running user app are preserved. No installation,
commit, push or version tag was requested or performed.

## Packaged Validation

- Windows build passed, including native helpers, original Blurry, TypeScript,
  production renderer/main/preload and signed NSIS installer.
- The initial packaged run passed full-monitor preview on all six displays,
  automatic viewer visibility, idempotent stop and partial-video helper-exit
  recovery. Its window-viewer cursor pixel assertion failed (zero pixels), and
  topmost/focus assertion failed (no focused test-app window). Topmost native
  Z-order itself passed. One unrequested real quiet-mode case was skipped.
- Neither assertion was weakened. The window-viewer test passed when rerun
  alone in 1.1 minutes, including mouse on/off, webcam, direct Windows display
  affinity, resize/switch, minimize/restore, close/reopen during native MP4
  capture and valid saved screen/webcam videos.
  Artifacts: C:/Users/DELL/AppData/Local/Temp/openscreen-recording-preview-4RE0Qe
  Packaged compact webcam screenshot visually inspected.
- The unchanged topmost/focus test then passed alone in 10.9 seconds.
- Final isolated rechecks confirmed complete at 12:28:18.
- Packaged monitor artifacts:
  C:/Users/DELL/AppData/Local/Temp/openscreen-monitor-preview-p1DnGe
- Packaged helper-exit recovery artifacts:
  C:/Users/DELL/AppData/Local/Temp/openscreen-recorder-recovery-fEZqRt
- Overall the five requested packaged checks passed across the initial run and
  isolated rechecks, not a single all-green suite invocation.

## Delivery

- Portable: D:/REPOS/openscreen/release/1.10.3/win-unpacked/Openscreen.exe
  Written 12:23:46; 223,286,272 bytes; product version 1.10.3.0.
  SHA256: 7C4FA93ED2E4AFE945EA83EFA6090C164B3C5826B6B4AA02BEFFA7DCB1E771B7
- Installer: D:/REPOS/openscreen/release/1.10.3/Openscreen-Windows-x64-1.10.3-Installer.exe
  Written 12:26:12; 345,141,572 bytes; product version 1.10.3.
  SHA256: 4185EA941F102E802792D3BF0A3090CEBFFBF53414C276D23D2B5C3C6F58D68B
- Stop any recording before switching from the running 1.10.2 to 1.10.3.
  The installed Program Files copy was not replaced automatically.
