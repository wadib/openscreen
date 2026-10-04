# Openscreen Shortcuts

Implemented 2026-09-15 and packaged in Windows release 1.10.4.
See RELEASE-1.10.4.md for packaged validation and installer metadata.

## Settings

Settings has General and Keyboard Shortcuts tabs. The latter reuses Studio's
shortcut editor and the existing shortcuts.json configuration, not a separate
set of bindings. Customizable actions can be rebound, conflicting actions
swapped, and defaults restored. Standard fixed shortcuts remain listed
separately. Feature-gated actions follow the existing Studio feature flags.

Escape cancels an active key capture without closing Settings. Changing tabs
preserves a pending shortcut draft and stops key capture. Cancel and uncommitted
reset do not write the shortcut configuration. Save applies the active pane:
General saves the existing recording/language preferences, while Keyboard
Shortcuts saves its shortcut configuration.

Successful shortcut saves update any open shortcut provider, including Studio.
The native Open App shortcut is registered before an atomic configuration-file
replacement. Unavailable bindings do not overwrite the previous file. File
failures attempt to restore the previous global binding. Concurrent saves are
serialized. Editing is disabled until initial loading completes, and pending
saves block tab changes or closure.

Reset is an accessible icon with a tooltip. The compact footer remains a single
row; the list scrolls independently.

This does not add recording start/stop, preview or native Blurry-launch hotkeys.
Blurry's own customizable hotkeys remain in its original settings window.

## Validation

- Ten backend tests passed: validation, reserved/duplicate bindings, native
  registration failure, file-write/rename rollback and concurrent saves.
- Four provider tests passed: initial loading, cross-window synchronization,
  stale initial reads, cleanup and failure reporting.
- Source Electron Settings integration and the existing language/after-recording
  integration passed together: two tests in 1.2 minutes.
- Final compact-layout shortcut integration passed again in 1.0 minute.
  Screenshot visually inspected:
  C:/Users/DELL/AppData/Local/Temp/openscreen-settings-shortcuts-zoV07l/settings-shortcuts.png
- TypeScript, scoped Biome and tracked-file whitespace checks passed.
- New translation keys are present in every supported locale.
  The full repository translation check still fails on pre-existing missing and
  extra keys in other areas; no unrelated translation rewrite was performed.

The Windows 1.10.4 installer was built. No installation, commit or push was
performed.
