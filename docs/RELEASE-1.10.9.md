# Openscreen 1.10.9

## Recording synchronization

- Timestamps each newly captured Windows frame at its Windows Graphics Capture time instead of the later encoder-consumption time.
- Uses the shared recording clock for repeated static frames so still screens continue for their real duration.
- Writes a final frame at Stop before flushing audio and finalizing the MP4.
- Reports maximum screen-frame delivery latency in recording diagnostics.

## Countdown placement

- Re-centers the countdown on the selected monitor or window on every countdown tick.
- Reasserts always-on-top placement while counting down, including after the selected window moves.

## Verification

- Native audio timing tests passed, including the simulated half-hour timeline.
- The source Electron countdown test passed, including movement of the selected recording window.
- A 53-second real screen/system-audio capture passed with seven markers. Audio-to-frame offsets remained between 23 and 57 ms from the first marker through the last, with no drift.

## Build scope

Windows x64 installer. Existing releases and the installed application are preserved; nothing is installed automatically.

## Packaged verification

- The countdown test passed against the packaged executable, including moving the selected recording window during the countdown.
- The packaged 53-second flash-and-tone capture passed with seven markers. Audio-to-frame offsets were 47, 47, 43, 47, 63, 47 and 37 ms, with no increasing drift. The test used no native-helper override.
- A packaged three-minute mostly-static capture passed. Video duration was 180.250 seconds, audio duration was 180.245 seconds, and Stop-to-Studio took 1,238 ms.
- The embedded native helper is byte-identical to the tested source helper.

## Delivery

- Installer: `D:\REPOS\openscreen\release\1.10.9\Openscreen-Windows-x64-1.10.9-Installer.exe`
- Size: 345,142,742 bytes.
- SHA256: `6866B9F1EC9B712137793DCF7C28155BEB2F9A331EADDC45DAF669D005ED91F9`
- Packaged executable version: 1.10.9.
- Authenticode: NotSigned; Windows may display an unsigned-publisher warning.
- Embedded helper SHA256: `3E21525FA26C71EE314C32C046D480743E628428E0ED5425119D8E2401663E74`
