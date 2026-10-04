# After recording

The recorder's Settings icon sits immediately left of Open Studio. It opens a
compact Settings window with Language and When recording stops selections.
The language picker is no longer in the recorder toolbar. Save applies both
choices; Cancel leaves both unchanged. A saved language updates open renderers
immediately and persists between launches.

When recording stops selects one saved behavior:

- Open in Openscreen (default): retain the original editing workflow.
- Choose another editor: select an application and open the saved screen video
  as one file argument, without a shell. Missing applications fall back to
  Openscreen. Webcam and editable cursor sidecars are not passed to external apps.
- Export directly: open a compact preview with MP4 quality or GIF frame rate,
  size and looping, then use the existing destination picker and export engine.

The Format menu offers Original MP4 (fast), MP4 (styled) and GIF. Original export
copies the approved screen recording directly on disk, preserving its encoded
video, audio, frame rate and dimensions without loading it into the renderer or
re-encoding it. Only MP4 sources are supported; WebM recordings retain the styled
MP4/GIF routes. Its preview omits editor effects and separate cursor/webcam layers,
which are listed as excluded when present. The source cannot be overwritten,
and a failed copy or replacement preserves an existing destination.

The compact view's Export & copy path button copies the saved MP4/GIF path to
the clipboard after a successful export. Cancelling or failing to save leaves
the clipboard unchanged. A clipboard failure does not invalidate the saved file.
The compact view also offers Open in editor, Show in folder and Copy file path.
Original recordings are retained. It does not implement clipboard video-file
transfer or returning focus to the pre-recording application.

The choice is stored in after-recording.json under Electron's userData directory.
Settings also offers two independent, off-by-default visibility choices:

- Hide after recording finishes: Openscreen opens its selected editor/export view
  hidden, or keeps the recorder hidden after launching an external editor.
- Hide after video is saved or dismissed: successful MP4/GIF exports hide their
  window, after copying the path in direct-export mode. Done returns to a hidden
  recorder; closing the editor hides it after any unsaved-changes confirmation.

Tray Open, the configured global shortcut and the macOS dock reopen the hidden
window. Hiding does not quit the app or delete the original recording, and saved
editor windows retain their editing state. Explicit New recording still opens
the recorder. Canceled or failed saves do not trigger automatic hiding.

Invalid preferences revert to Openscreen. Direct export uses the same render
state and exporter as the editor, not a second encoder. A one-time cold-load
reload restores WebCodecs when Electron omits it on a new export renderer.

Validation: TypeScript, 41 focused regression tests, and the isolated Electron
after-recording end-to-end test for real MP4/GIF outputs and compact screenshots.

Releases use the version in package.json and matching root package-lock.json
entries. Keep electron-builder's default release/${version} output directory;
do not override it with ad hoc preview folder names. Windows installers include
the version in their filename. Validate the packaged app's reported version and
Windows executable version before delivery. The installed application is updated
by running the versioned installer, not by patching Program Files manually.
