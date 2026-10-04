# Recording Preview

The recorder's eye control opens an optional, resizable, always-on-top viewer
for the selected screen or window, before and during recording. Closing the
viewer does not stop a recording. Opening an editor or finishing into an
external editor closes the viewer.

The viewer is video-only and muted, limited to 960 x 540 at 15 fps. A separate
Windows Graphics Capture helper produces preview frames without an encoder,
audio, or output file. Its cursor flag follows the recorder's mouse toggle;
the adjacent menu chooses editable or baked-in cursor mode when visible.
The normal native MP4 recording path and export settings are unchanged.
Cursor-off recording requires native Windows capture; it never silently falls
back to a browser path that may bake the cursor into the video.

The webcam is shared from the recorder's existing camera stream over a local
WebRTC connection, not acquired again by the viewer. It uses the editor's
default picture-in-picture layout. Closing the viewer closes its connection,
never the recorder's camera tracks. Later editor effects and custom editable
cursor styling are not previewed. Original MP4 (fast) still exports the raw
screen recording without the separate webcam or editable cursor layers.

Changing source, minimizing, or closing releases the preview capture tracks;
restoring reconnects. A missing source or failed capture shows an unavailable
state and retry control, never a fallback to another screen.

Enabled on Windows 10 build 19041 (version 2004) or later. The window is capture
protected before any viewer content is loaded or made visible, preventing
recursive capture. Invisible native initialization is required on Electron 41
before display affinity can be enabled and checked. Since 1.10.3, initialization
waits for confirmed protection for up to two seconds rather than rejecting
the window immediately during the first-show race. It stays invisible and
click-through until protection succeeds; failure destroys it without loading
viewer content. The viewer itself is
excluded from the source picker.
The viewer is intentionally unavailable on macOS/Linux until equivalent
capture exclusion is implemented and tested.

Fast development validation (no installer packaging):

```powershell
npm run test:e2e:dev -- tests/e2e/recording-preview.spec.ts --workers=1
```

This runs the current renderer source with native capture and a synthetic
camera. It checks changing pixels, cursor visibility, webcam playback, direct
Windows display affinity, source changes, compact sizing, minimize/restore,
and native MP4 recording while the viewer is closed and reopened. Set
`OPENSCREEN_TEST_REAL_CAMERA=1` to run the same checks with a physical camera.
`npm run dev` opens the current source interactively without packaging.
