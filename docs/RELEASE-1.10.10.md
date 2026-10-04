# Openscreen 1.10.10

## Post-recording foreground recovery

- When **Hide after recording finishes** is off, the Windows Studio/export window is explicitly raised above the previously active recording target.
- Studio briefly enters the topmost band while it is revealed, then returns to normal window behavior so it does not permanently cover other applications.
- The recorder HUD remains permanently topmost without stealing focus.
- Hidden post-recording and post-save behavior is unchanged.

## Source verification

- Eight Electron lifecycle tests passed for post-recording foreground recovery, recorder topmost recovery, all four hide-setting combinations, editor close behavior, and native-helper failure recovery.
- TypeScript production build and scoped Biome checks passed.

## Build scope

Windows x64 installer. Existing releases and the installed application are preserved; nothing is installed automatically.

## Packaged verification

- All eight packaged lifecycle tests passed with no development server or helper override.
- The unticked **Hide after recording finishes** case raised Studio above the previously focused window.
- The recorder HUD recovered above a competing topmost window without taking focus.
- All four recording/video hide-setting combinations passed.

## Delivery

- Installer: `D:\REPOS\openscreen\release\1.10.10\Openscreen-Windows-x64-1.10.10-Installer.exe`
- Size: 345,141,379 bytes.
- SHA256: `470AB5E5464784B9638EF16A3C8C3AED36CBE4BFAE47BB8123A9F6683CB13914`
- Packaged executable version: 1.10.10.
- Packaged executable SHA256: `30E4B90D3A188D9D3B28B6A92586CA06F39C63C53F710EF3BC8BE0A5F69E338E`
- Authenticode: NotSigned; Windows may display an unsigned-publisher warning.
- Installed application remains version 1.10.9.
