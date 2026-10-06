# Open Studio MCP

Introduced in Openscreen 1.10.25; MCP interface version 1.0.0.

Local stdio MCP server for Studio only. No screen capture, microphone capture,
shell execution, file deletion, or uploading tools are exposed. An agent session
runs in a separate Openscreen process/profile, does not register global recorder
shortcuts, and blocks HTTP/HTTPS/WebSocket requests. Your normal recorder is not
controlled by this server.

## Build and Connect

Build the current source with `npm run build-vite`. Node 22 is required for the
stdio launcher. No additional packages or MCP SDK downloads are required.

Example MCP client configuration for this development checkout:

```json
{
  "mcpServers": {
    "openscreen-studio": {
      "command": "node",
      "args": [
        "C:/path/to/openscreen/scripts/studio-mcp.mjs",
        "--executable", "C:/path/to/openscreen/node_modules/electron/dist/electron.exe",
        "--app", "C:/path/to/openscreen",
        "--root", "C:/Users/YOU/AppData/Roaming/openscreen/recordings"
      ]
    }
  }
}
```

Add another `--root` pair to grant an export folder; folders must already exist.
For an MCP-enabled packaged Openscreen executable, set `--executable` to that
executable and omit `--app`. Older installed releases do not support this bridge.
This source change does not configure any agent client automatically.

Launching the command explicitly opts in. Each launch creates a random,
authenticated local named pipe (Windows) or Unix socket in a private temp
directory. No TCP port is opened. The temporary Studio profile stays on disk;
disconnecting the agent does not terminate Studio or discard its unsaved work.
Optional `--profile <dedicated-directory>` reuses an agent-only profile. Never
point this at the normal recorder's profile or share a profile between sessions.

## Tools

`studio_status`, `studio_open_project`, `studio_set_zoom`, `studio_add_trim`,
`studio_add_speed`, `studio_remove_region`, `studio_set_microphone`,
`studio_set_layout`, `studio_history`, `studio_preview`, `studio_snapshot`,
`studio_save_copy`, `studio_export`, `studio_cancel_export`, `studio_close`.

All times are source milliseconds. Zoom focus and custom area dimensions are
normalized; `area.fit` is `fit` or `fill`. Trim intervals REMOVE time, not keep it.
Audio gain is a multiplier; positive microphone offset delays audio. Microphone
settings follow the existing editor behavior and are not included in undo/redo.

1. Call `studio_open_project` with an absolute project path inside a granted root.
2. Poll `studio_status` until `ready` is true. Read `revision` and inspect `project`.
3. Edit using that revision. Returned revisions include synchronous UI updates;
   a stale revision is rejected, including if a person edits Studio concurrently.
4. Seek using `studio_preview` and inspect `studio_snapshot` (PNG screenshot).
5. Use `studio_save_copy` to save a NEW `.openscreen` file. The saved copy becomes
   Studio's current project. Originals remain unchanged.
6. Use `studio_export` with a NEW `.mp4` output path and quality `medium`, `good`,
   or `source`. Poll status's `exportJob.state`: `running`, `completed`, or `failed`;
   on `failed`, status's `exportError` carries the renderer's diagnostic.
7. Call `studio_close` when finished. Studio deliberately survives a disconnect, so
   without it each session leaves its window open. It refuses while an export runs or
   while edits are unsaved (pass `discardUnsaved: true` to drop them). The window title
   shows the open project and export progress so concurrent instances are distinguishable.

Export uses the editor's existing MP4 renderer and audio pipeline, not a separate
encoder. It does not promise automatic audio synchronization or fix recording
defects. GIF export and adding new annotations are not exposed in this first API.

Existing output files are never overwritten, including during concurrent saves.
Paths outside the granted roots, UNC/network paths, alternate data streams and
symlinks/junctions escaping roots are refused. Project source-media paths are
checked before loading. Unsaved edits block opening a different project. Edits
are blocked while an agent export is running; status, screenshot and cancel
remain available. Closing Studio fails pending requests instead of recording.

The MCP transport itself is local. The agent/client receiving project metadata
or screenshots may use a cloud model; configure that client appropriately. The
server does not enforce a cloud client's separate approval or data policies.

## Verify

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run electron/studio-mcp src/components/video-editor/studioEdits.test.ts
node scripts/test-studio-mcp.mjs
```

The end-to-end test creates its own synthetic media/profile, speaks MCP over
stdio, edits and saves a project copy, exports a short MP4, and checks originals.
It never opens your recordings or stops an existing Openscreen process.
