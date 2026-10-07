# Openscreen 1.10.32

## Window buttons on Linux

- Tiling compositors such as Hyprland (Omarchy) draw no title bar, so the editor window had no visible way to close it (only the compositor shortcut, for example Super+W).
- On Linux the editor's top bar now has **minimize, maximize/restore and close** buttons. Close goes through the normal close path, so the unsaved-changes prompt still appears.
- Windows and macOS keep their native controls. The other windows were checked: the recording HUD has its own minimize and close buttons, Settings and the source picker have Cancel buttons, and the recording preview is toggled from the HUD.

## CrisperWhisper server status in Clean up

- With **Filler words → CrisperWhisper server** selected, the Clean up dialog checks the server as soon as it opens (and again when the address changes). It shows **Server online**, **Checking…** or **Not reachable**, with the command that starts it (`systemctl --user start crisperwhisper`) and a Retry button. **Clean up** is disabled until the server answers, instead of failing midway with a generic network error.
- New default address: `http://127.0.0.1:8090/` on Linux (the server runs on the Z13 itself) and `http://omarchy:8090/` elsewhere (the Z13's Tailscale name). The old default `http://192.168.86.250:8080/` is migrated automatically; custom addresses are kept.
- On the Z13 the server now runs as the systemd user service `crisperwhisper` on port 8090. It starts at login and restarts if it crashes. Port 8080 stays free for the file-transfer server.

## Update check

- The repository has no published releases (installers are distributed manually), so GitHub answers 404. **Check for updates** used to report that as a failure. It now says plainly that no updates are published online and that new versions are installed manually.

## Verification

- New tests: window buttons (the three actions on Linux, nothing rendered on Windows); server reachability (online on any HTTP answer, offline on network error); default addresses per platform and migration of the old address; the update check's no-releases case.
- Full suite: 75 test files, 510 tests passed (1 skipped). Browser suite: 7 files, 21 tests passed. `tsc --noEmit` clean. Biome: no new warnings. i18n: the new strings are in all 13 locales; the existing gaps are unchanged.
- CrisperWhisper service on the Z13: active after enable; a 10 s clip transcribed in 4.7 s with both "[UH]" fillers found; reachable from the Dell at `http://omarchy:8090/` and `http://100.115.34.11:8090/`.

## Build scope

Windows x64 installer and Linux AppImage, deb and pacman packages, built from the same source. Existing releases and installed applications are preserved; nothing is installed automatically.

## Delivery

- Windows installer: `C:\REPOS\openscreen\release\1.10.32\Openscreen-Windows-x64-1.10.32-Installer.exe`, 346,669,332 bytes, SHA256 `9FC899B2029359245189A32DF16F89956E2BE4A61823F59828F1C9F499F4D6FC`. Packaged executable version 1.10.32. Authenticode: NotSigned.
- Linux, built on the Z13 from the same source:
  - `Openscreen-Linux-1.10.32.pacman`, 239,684,908 bytes, SHA256 `1AA9D65183C2761B268AD6CD334834A3069F382A46B9A2C491127313A5BFC987`; `pacman -Up` resolves all dependencies;
  - `.deb`, 269,088,552 bytes, SHA256 `78F34748015A922B205EA09650928828589F81421E11D047C4731FDCB6FEA188`;
  - `.AppImage`, 336,385,720 bytes, SHA256 `66EE4B9DA8B822D5F910507571870953E5C824DD075D69A4761BD330AB95913B`.
- Component manifest: studioMcp 1.0.0, captureEngine / blurry / cameraControls 1.10.32.
