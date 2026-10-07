# Openscreen 1.10.34

## Recording bar on Wayland / Omarchy

- **The drag handle works on Linux.** The HUD moved itself by requesting new window coordinates, which Wayland compositors ignore, so the dots did nothing on Omarchy (Hyprland). Only the empty area around the bar could be dragged, because the whole window was a native drag region. On Linux the handle is now a native drag region too, so the compositor moves the bar from the dots. Windows and macOS keep the existing behaviour.
- **Fixed window titles for the overlays.** The recording bar is now always titled "Openscreen Recorder" and the countdown "Openscreen Countdown", instead of taking the page title. Tiling compositors can target these windows with a rule without affecting the editor, which shares the app id.
- **Hyprland rule (Z13).** Hyprland draws a border, rounded corners, a shadow and a blur behind every floating window, including the transparent area around the bar, which showed up as a large box. `~/.config/hypr/openscreen.lua` (loaded from `hyprland.lua`) gives both overlays no border, rounding, shadow, blur or dimming, full opacity, pinned and floating. It also places the bar at the bottom centre, since Wayland ignores the position the app asks for. The config reloads with no errors.

## Verification

- Full suite: 75 test files, 513 tests passed (1 skipped). `tsc --noEmit` clean. Biome: no new warnings.
- On the Z13, Hyprland reports this build's bar as "Openscreen Recorder": floating, pinned, at the bottom centre. Its window properties read border_size 0, rounding 0, no_shadow, no_blur, opacity 1. A running 1.10.33 bar (old title) was unaffected. The drag handle itself needs a hand test on the device; it now uses the same native drag region as the area around the bar, which already moved the window.

## Build scope

Windows x64 installer and Linux AppImage, deb and pacman packages, built from the same source.

## Delivery

- Windows installer: `C:\REPOS\openscreen\release\1.10.34\Openscreen-Windows-x64-1.10.34-Installer.exe`, 346,671,420 bytes, SHA256 `D6694E35A6EC81AE2673407FBEC3162A3E138A13ED9BDEB72831CC066579E24A`. Packaged executable version 1.10.34. Authenticode: NotSigned.
- Linux, built on the Z13 from the same source:
  - `Openscreen-Linux-1.10.34.pacman`, 239,677,244 bytes, SHA256 `8DB7B1ACCC624E4039B8F65AA55CAF1414A4007A763BF5D10152D577B9C16A44`; `pacman -Up` resolves all dependencies;
  - `.deb`, 269,088,616 bytes, SHA256 `E7F6674930DF5703C5B3542BADBE4CFEB786C9941DCA5C7899705C38D40C5C94`;
  - `.AppImage`, 336,385,813 bytes, SHA256 `4ED42EAB7D018667064038CB38D50D8D1D244F0F7893D7C4EEBDB7343D1066FA`.
- Component manifest: studioMcp 1.0.0, captureEngine / blurry / cameraControls 1.10.34.
