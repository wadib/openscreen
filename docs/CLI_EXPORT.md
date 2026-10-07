# Command-line export

Openscreen can export `.openscreen` projects to MP4 without opening the editor UI. This is meant for scripts and batch renders, for example rendering every finished project on a faster machine overnight.

```text
Openscreen --export <project.openscreen> <out.mp4> [--export <project> <out.mp4> ...]
Openscreen --export-dir <projects folder> <output folder>

Options:
  --quality medium|good|source   Export quality (default: good)
  --overwrite                    Replace existing output files (default: skip them)
  --show                         Show the editor window while exporting
  --only <pattern>               With --export-dir: only projects whose name matches
                                 (* and ?, e.g. --only "*_done"); repeatable
  --exclude <pattern>            With --export-dir: skip matching projects; repeatable
```

- Jobs run one after another in a single hidden editor window, using exactly the same rendering and audio pipeline as the Export button. All project settings apply, including zooms, trims, the webcam, cursor effects, audio enhancement and smooth cuts.
- `--export-dir` exports every `.openscreen` file in the folder, in name order, to `<output folder>/<project name>.mp4`. Narrow it with `--only` and `--exclude`: shell-style patterns matched against project names, case-insensitive, with the `.openscreen` extension optional.
- Unless you pass `--overwrite`, outputs that already exist are skipped, so a batch that was interrupted can simply be run again.
- Progress (every 5%), diagnostics (video encoder and profile, audio codec, Linux frame path, encoder retries) and a summary line are printed to stdout. The exit code is `0` when every job succeeded, `1` when any job failed and `2` for a usage error.
- Media that moved together with the project is found through the project's relative paths (see portable projects in 1.10.30).

## Examples

Windows (PowerShell). The packaged app is a GUI program, so pipe its output to see the progress:

```powershell
& "C:\Program Files\Openscreen\Openscreen.exe" --export D:\work\p2_done.openscreen D:\renders\p2.mp4 | Out-Host
```

Linux (Z13):

```bash
openscreen --ozone-platform=wayland --export-dir ~/Videos/Openscreen ~/Videos/Openscreen/exports --only "*_done" --exclude "*p2_done"
```

On Linux, Chromium prints `[OpenH264] Warning: …` lines from its software encoder. They are harmless and come from Chromium itself, so Openscreen cannot hide them.

## Notes

- The editor window is hidden but it still renders, so the machine must have a display session. Over SSH on Linux, point at the logged-in session and pass the platform flag:

  ```bash
  export XDG_RUNTIME_DIR=/run/user/$(id -u) WAYLAND_DISPLAY=wayland-1
  openscreen --ozone-platform=wayland --export ~/Videos/Openscreen/p2b_done.openscreen ~/Videos/Openscreen/exports/p2b.mp4
  ```

  Without `--ozone-platform=wayland`, Electron looks for an X server and exits.
- A command-line export can run while a normal Openscreen window is open.
