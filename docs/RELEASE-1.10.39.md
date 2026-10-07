# Openscreen 1.10.39

## Project name no longer overlaps the top-bar buttons

- The project name in the editor's top bar was centred over the whole bar. In a narrower window, such as a tiled window on the Z13, it was drawn on top of the buttons on the left, covering **Batch export**.
- The name now sits in the space between the buttons and the window controls. It shortens with "…" when there is not enough room and never covers a button. Hover over it to see the full project path.
- When the window is narrower than 1024 px, the **New recording**, **Load project**, **Save project** and **Batch export** buttons show only their icons. Hover over a button to see its name.

## Batch export shows when it has finished

- When a batch finished, the dialog refreshed its project list straight away. That removed the summary and the ticks, and showed **Export N projects** again, so it looked as if nothing had happened.
- Now the results stay on screen: each project's tick or cross with its time, and a green banner such as "7 of 7 exported in 412 s" (red if any project failed). They stay until you change a setting or click **New batch**.
- A notification with the same summary appears in the editor when the batch ends, even if the dialog was hidden.
- After a run, the **Export** button is replaced by **New batch**, so the same projects can't be exported again by accident.

## Verification

- `tsc --noEmit` clean. Biome: no new warnings. Full suite: 80 test files, 537 tests passed (1 skipped), including the top-bar name tests. i18n: the new **New batch** string is in all 13 locales.

## Build scope

Windows x64 installer and Linux AppImage, deb and pacman packages, built from the same source.

## Delivery

- Windows installer: `C:\REPOS\openscreen\release\1.10.39\Openscreen-Windows-x64-1.10.39-Installer.exe`, 346,681,444 bytes, SHA256 `D51B952BC46A0C7F8DF8DD9D6C745FC3BD122D8DAC00D8293476ACC3D78BA9F9`. Packaged executable version 1.10.39. Authenticode: NotSigned. Built to `C:\REPOS\openscreen-build\1.10.39` because drive D: was full.
- Linux, built on the Z13 from the same source:
  - `Openscreen-Linux-1.10.39.pacman`, 239,703,480 bytes, SHA256 `1323A8FAA7211DB92C87E7A65A1BBEBB6D36B3533AD31767E56AADB950F72D60`; `pacman -Up` resolves all dependencies;
  - `.deb`, 269,100,452 bytes, SHA256 `2E008ABB7867AE25C0DF67979DB8616C81A1DD4373E098B652A7B3E6942D0F3B`;
  - `.AppImage`, 336,401,873 bytes, SHA256 `CE177C758553EE83892E5AE9C733D43651283175C22D96610A766D3CA44B6AB2`.
- Component manifest: studioMcp 1.0.0, captureEngine / blurry / cameraControls 1.10.39.
