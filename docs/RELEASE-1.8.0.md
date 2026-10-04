# Openscreen 1.8.0

Windows x64 release built on 2026-09-14 (Asia/Dubai).

- Installer completed at 11:52:10:
  `D:\REPOS\openscreen\release\1.8.0\Openscreen-Windows-x64-1.8.0-Installer.exe`
- Portable executable:
  `D:\REPOS\openscreen\release\1.8.0\win-unpacked\Openscreen.exe`
- Installer size: 289,386,070 bytes.
- Installer SHA256: `DFBD5CD1F395F00345659E9FEE9A4A6ECF4A330F96EF42DDE382DE7587817C67`.
- Package metadata, installer and portable executable all report 1.8.0.

## Changes

Adds an opt-in Quiet recording setting, disabled by default, with platform-specific
notification suppression and automatic restoration. Preserves the existing viewer,
editor choice, language settings and direct export workflows from 1.7.1.

Windows uses a runtime-guarded undocumented Quiet Hours COM interface. macOS
requires user-created Shortcuts; Linux supports GNOME/Unity and KDE with the
dependencies described in [Quiet Recording](quiet-recording.md). Native macOS
and Linux verification and installers remain pending.

## Validation

Windows native helpers, TypeScript, Vite and NSIS packaging completed successfully.
25 focused tests passed before packaging. All four packaged E2Es passed in
1.5 minutes: Settings/version, styled MP4/GIF and original MP4 export, quiet-mode
native recording/stop restoration, and isolated recorder termination recovery.

The separate broader viewer E2E previously failed its hardware-cursor pixel
assertion before capture; this release validation is not a full viewer-suite pass.

No commit, push or installation was performed. The installed executable was
verified as 1.7.0 before this build; earlier release directories were preserved.
