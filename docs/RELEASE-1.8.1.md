# Openscreen 1.8.1

Windows x64 bug-fix release built on 2026-09-14 (Asia/Dubai).
Installer completed at 18:10:04. Earlier releases were preserved.

- Installer: `D:\REPOS\openscreen\release\1.8.1\Openscreen-Windows-x64-1.8.1-Installer.exe`
- Portable app: `D:\REPOS\openscreen\release\1.8.1\win-unpacked\Openscreen.exe`
- Installer size: 289,388,352 bytes.
- Installer SHA256: `C950CAD779EB3C3C5E50E5600978891AD8E743423891BE92802C9B4A0C78F0D8`.
- Package, lockfile, installer and portable executable version: 1.8.1.

## Fixes

- Windows Stop is idempotent when capture is already absent. Cleanup still resets
  the tray, cursor sampler and quiet mode.
- A stopped capture with a save failure clears recording/pause/timer controls;
  partial screen files remain on disk. If termination cannot be confirmed, Stop
  remains available for retry. Cancel and Restart honor that distinction.
- Native stdout/stderr is drained throughout capture. Unexpected helper exit
  requests finalization automatically; already-exited helpers do not wait for a
  close event that has already occurred.
- The recorder reasserts topmost z-order without activating itself. Explicit
  minimize/hide remains respected, and Settings/source/countdown popups are spared.
  The recording tray menu also offers Open to recover a hidden dashboard.
- Windows quiet-mode restoration uses a hidden detached Node host and actual
  Electron parent-PID monitoring. Killing the guardian itself or the whole process
  tree can still prevent restoration; this is not a machine-crash guarantee.

## Validation

30 focused tests passed. Six source E2Es passed in 1.2 minutes. Seven packaged
E2Es passed in 1.7 minutes: Settings/runtime version, MP4/GIF/original export,
repeated Stop, native dashboard z-order and retained focus, capture-helper exit
with partial-file preservation, quiet-mode recording/stop, and quiet restoration
after termination of the actual isolated Electron process.

Initial source test attempts exposed fixture synchronization and PID-targeting
issues, plus a genuine Windows guardian job-lifetime issue. Direct detached
PowerShell lost console I/O and was rejected; the final hidden Node host passed
normal and actual-main-process termination checks. Playwright's launcher on
Windows is a command shell, so termination tests now obtain Electron's actual PID.

Windows native helpers, TypeScript, Vite and NSIS packaging succeeded. The 11
touched code/test files passed Biome. The unrelated broader viewer cursor-pixel
test remains outside this focused pass; native macOS/Linux verification remains
pending. Wayland compositor policy can prevent forced topmost window behavior.

No commit, push or installation was performed. The reported live app was the
1.8.0 portable executable, not the installed 1.7.0 executable. Close the old app
before running 1.8.1. Recording files under userData were not deleted.
