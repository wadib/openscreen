# After recording

The recorder's After recording settings icon selects one saved behavior:

- Open in Openscreen (default): retain the original editing workflow.
- Choose another editor: select an application and open the saved screen video
  as one file argument, without a shell. Missing applications fall back to
  Openscreen. Webcam and editable cursor sidecars are not passed to external apps.
- Export directly: open a compact preview with MP4 quality or GIF frame rate,
  size and looping, then use the existing destination picker and export engine.

The compact view offers Open in editor, Show in folder and Copy file path.
Original recordings are retained. It does not implement clipboard video-file
transfer or returning focus to the pre-recording application.

The choice is stored in after-recording.json under Electron's userData directory.
Invalid preferences revert to Openscreen. Direct export uses the same render
state and exporter as the editor, not a second encoder. A one-time cold-load
reload restores WebCodecs when Electron omits it on a new export renderer.

Validation: TypeScript, 41 focused regression tests, and the isolated Electron
after-recording end-to-end test for real MP4/GIF outputs and compact screenshots.

Preview builds are separate from C:\Program Files\Openscreen. No installed
application files are patched, and source changes are not committed automatically.
