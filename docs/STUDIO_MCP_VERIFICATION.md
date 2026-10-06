# Studio MCP 1.10.25 Verification

Verified locally on Windows on 2026-10-06, 10:28 GST (UTC+04:00).
Acceptance remains with the user/client owner. No installer was created or
installed, no MCP client configuration was modified, and nothing was pushed.
The development checkout's compiled Studio is ready to connect using
`docs/studio-mcp.client.example.json`. MCP API version is 1.0.0.

## Results

- `npm run build-vite`: TypeScript, production renderer, main process, preload passed.
- Final full unit run started 10:27:01 GST, took 34.16 seconds: 62 files passed;
  439 tests passed, one existing skipped test. Includes 20 new MCP tests.
- Biome: all 13 new code/test/config files passed without warnings or errors.
- Real stdio MCP end-to-end test: all 14 tools discovered; open/status, custom
  zoom, stale revision refusal, microphone gain/offset, layout, undo/redo,
  trim/speed/remove, play/pause/seek, PNG screenshot, save-copy/reopen, MP4 export
  and cancellation verified against an isolated Electron Studio session.
- Export duration 3.669333 seconds after a speed edit to four-second media.
  The source video had NO audio. The exported audio was from the separate
  microphone WAV; decoded mono PCM RMS was 2310.8308 (non-silent).
- Canceling an export left no output file. Existing files could not be overwritten.
- Original synthetic project, video and microphone hashes remained unchanged.
- Disconnecting the stdio client left Studio running. Test cleanup closed only
  its own isolated Studio process; the normal recorder was untouched.
- Unit tests cover private-pipe authentication, oversized frames, wrong-renderer
  replies/export writes, renderer destruction, root boundaries, sibling prefixes,
  symlink/junction escapes, remote assets and concurrent exclusive creation.

End-to-end artifacts were retained in the test machine's private temporary
directory with `studio.png`, `edited.openscreen`, and `export.mp4` together.
The Studio screenshot was visually inspected: rendered preview, custom zoom,
microphone controls and edited timeline were present.

## SHA256 Handles

Paths below are relative to the repository root.

| Artifact | SHA256 |
| --- | --- |
| scripts/studio-mcp.mjs | A7EDF685E0483B82ECC630D2F016051930D89288F0FBC19FABFBA224439A11BC |
| docs/studio-mcp.client.example.json | C1EBDB8347DB7F08CEB2EA85329DCFC444B69384F8A3F665838A66C3365FCE4F |
| src/lib/studioMcpContract.ts | 1F06B5D84F741C7183FF6B987C3E45F5C57AB844A294658DE849C57B02FB1431 |
| electron/studio-mcp/server.ts | 450E3B0997EF46A57ECB1A14326AF79C8DEFCEADAA7E1BC0B7BAD9B955194EC2 |
| electron/studio-mcp/protocol.ts | BBF46C1B6176733BEE3857420348A4D43B7E7051203FBBEDFFBC7B2F05FC3781 |
| electron/studio-mcp/files.ts | C596625CA8D896AF01951116D9ADEEF5CB919F30D5E0160035929540A4F17CF2 |
| src/components/video-editor/useStudioMcp.ts | 2C32F7B85AE9D665B7E8E6598A5387DD54DB19E18C9531A4E95835938AD13B5F |
| src/components/video-editor/studioEdits.ts | DAA0CF166E29C5B7DBA796AC501FBB883B382066843C14C62D8AFC3086BACB15 |
| dist-electron/main.js | 40CABA778EBCC5CAD78E8E238B195BD469D5EEB281358AD00DF3079F4549FD65 |
| dist-electron/preload.mjs | ED2C4C251FF0970C54ADE15053E667CB7B181B65104BB5383A101D4974B094AA |
| dist/assets/VideoEditor-CpZ2dDEQ.js | 289A0FD9ADA155B062980424649D33B3194AB4F02C0215CBAA9BA1B09943E947 |
| temporary synthetic edited project | 3F4D26884814C447593E6DFC742E927AB46246813E6EC746F3B4EC865EFA5DBD |
| temporary synthetic MP4 export | 19F9BAE5CD3A20652105FDCA96AFBBB9A562148F9F2F07414887460BB7D68BF7 |

## Boundaries and Remaining Checks

Studio-only allowlist: no recording, shell, deletion, overwrite or upload tools.
Agent sessions use isolated profiles and do not register global recorder
shortcuts. Authenticated local pipe/socket only; no TCP listener. HTTP/HTTPS and
WebSocket requests are blocked in that Studio process. Granted folders control
local reads/new-file writes. Raster annotation images must be embedded.

This is not an audio-sync repair. Existing capture/audio/rendering pipelines are
reused; no recording engine, microphone capture or native helper was changed.
GIF export and adding new annotations are not in this API. Actual agent-client
connection and macOS/Linux runtime acceptance remain unverified. Source uses
cross-platform Node/Electron APIs and Unix sockets outside Windows.

Build retained existing warnings about stale Browserslist data, ONNX eval and
mixed static/dynamic shortcut-dialog imports. Unit jsdom emitted its existing
canvas-not-implemented warnings. No dependency downloads were performed.
