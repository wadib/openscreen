# Openscreen 1.10.37

## The project name inside the window

- Openscreen named the project only in the window title, and only for agent-driven Studio windows. Tiling compositors such as Hyprland (Omarchy) draw no title bars, so on the Z13 there was no way to tell which project a window, or one of several Studio instances, was working on.
- The editor's top bar now shows the **project name** in the centre (the file name without folders or `.openscreen`), with:
  - an amber dot when there are unsaved changes;
  - **Exporting N%** while an export runs;
  - a **Studio** badge on agent-controlled instances.
  Hovering the name shows the full path.
- The window title is unchanged (still "Openscreen Studio — name · exporting N%" in Studio mode) for systems that show title bars.

## Verification

- New tests: badge contents (name, unsaved marker, export percentage, Studio badge), nothing shown for an unsaved session outside Studio, and project names from Windows and Linux paths.
- Checked in the running app (Studio): the top bar shows "STUDIO" and the project name centred above the preview.
- Full suite: 78 test files, 528 tests passed (1 skipped). Browser suite: 20 of 21 passed in the full run. The known flaky `recordingSync.browser.test.ts` failed once, then passed twice on its own. `tsc --noEmit` clean. Biome: no new warnings. i18n: the new strings are in all 13 locales.

## Build scope

Windows x64 installer and Linux AppImage, deb and pacman packages, built from the same source.

## Delivery

- Windows installer: `C:\REPOS\openscreen\release\1.10.37\Openscreen-Windows-x64-1.10.37-Installer.exe`, 346,676,382 bytes, SHA256 `7221ABF14C0D06BEE5200DD5D4282FCA2B1377AC0B92EA9F3280412F8B632A97`. Packaged executable version 1.10.37. Authenticode: NotSigned.
- Linux, built on the Z13 from the same source:
  - `Openscreen-Linux-1.10.37.pacman`, 239,707,972 bytes, SHA256 `59A89B213686BE32DA83F325790E29B5DF5F25FADA7BE5CC6489C9DA6E6C53B7`; `pacman -Up` resolves all dependencies;
  - `.deb`, 269,097,232 bytes, SHA256 `58D31A6A0D0510C9D170C74069FAC4F3F53E492A7463720AEB15B1B6199F2C66`;
  - `.AppImage`, 336,385,051 bytes, SHA256 `86569F6D5D417511B19AA8B8E40A3A437613E5124E16B50094780BE78A03CAE8`.
- Component manifest: studioMcp 1.0.0, captureEngine / blurry / cameraControls 1.10.37.
