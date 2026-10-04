# Openscreen 1.10.11

## Window dropdown capture

- Window recordings now include native menus, combo-box lists, and tooltips that Windows exposes as separate popup windows.
- Openscreen keeps the selected window as the base capture and composites only popup pixels belonging to that application. It does not silently record the full monitor.
- The live viewer uses the same popup overlay path, so its window preview matches the recorded result.
- Popups outside the selected window's fixed video bounds are clipped at the recording edge.

## Verification

- The native Windows helper compiled cleanly with MSVC warning level 4.
- A real Electron native-menu recording test detected 5,610 menu pixels in the MP4; the pre-fix baseline detected zero.
- The menu recording test passed repeatedly, and 23 focused recorder, stop, and preview-protection tests passed.

## Build scope

Windows x64 installer. Existing releases and the installed application are preserved; nothing is installed automatically.

## Delivery

- Installer: `D:\REPOS\openscreen\release\1.10.11\Openscreen-Windows-x64-1.10.11-Installer.exe`
- Size: 345,146,981 bytes.
- SHA256: `AD9B5F46C8DFAF239C8695AC22D70DA351F70413F4D8FD5990B7FF3E3D0FC137`
- Packaged executable version: 1.10.11.
- Packaged executable SHA256: `D33D2A044DBCA053129BF3094F77975A26385F77CC21A52525055EFC7031078B`
- Bundled WGC helper SHA256: `B741F3690424B39AF7D0DC0B408990CBA2F854772698537A82B3DD55D3E01F06`
- Authenticode: NotSigned; Windows may display an unsigned-publisher warning.
- Installed application remains version 1.10.9.
