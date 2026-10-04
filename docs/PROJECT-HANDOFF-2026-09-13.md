# ScreenContext to Openscreen: Detailed Project Handoff

Prepared: 2026-09-13, Asia/Dubai (UTC+04:00).
Scope: this conversation's ScreenContext Windows work, transition to Openscreen, and verified Openscreen 1.7.1 delivery.
Audience: the next developer or agent maintaining the current Windows product.

## 1. Current State and First Actions

- Main product: Openscreen. Active development repository: `D:\REPOS\openscreen`.
- Historical/reference repository: `D:\REPOS\screencontext`. The task's default shell directory may still point there; explicitly set the working directory to Openscreen for application work.
- Latest built release: **1.7.1**, successfully packaged and tested on 2026-09-13.
- Installed executable: `C:\Program Files\Openscreen\Openscreen.exe`, verified during this handoff as **1.7.0**. Building 1.7.1 did not install it.
- Openscreen branch: `main`, HEAD `3a464df`. The local tracking reference `origin/main` points to the same commit. This was checked locally, without fetching.
- Current improvements after that commit are still uncommitted, including original MP4 export, native viewer/cursor/webcam fixes, Settings, localization, and test harness work.
- Do not reset, clean, discard, or overwrite either dirty worktree. Do not patch Program Files manually.
- No build or verification process remains outstanding from the 1.7.1 delivery.
- The earlier dev-server PID is no longer present. Port 5174 had no listener during this handoff; an open browser tab alone does not prove the dev app is running.
- No commit, push, installation, or feature change was performed in the latest build request or this handoff request.

Next session should read the two existing feature documents, inspect Git status and the current diff, then choose the requested action. Do not assume the installed application is the newly built release.

## 2. Evidence and Timing Conventions

All timestamps below are Dubai local time, UTC+04:00, unless explicitly stated.

Three evidence levels are kept separate:
1. **Commit time:** records a Git checkpoint, not the precise start or completion time of every feature.
2. **Filesystem time:** observed creation/write time; copying or rebuilding can change it.
3. **Session evidence:** tool/test results observed in this conversation. Earlier results were not rerun merely to write this handoff.

Exact start times and effort durations are unavailable for several early requests. Do not invent them or interpret the whole elapsed conversation as continuous engineering effort.

### Timestamped Timeline

| Local Time | Checkpoint | Evidence / Qualification |
| --- | --- | --- |
| 2026-09-11 21:00:40 | ScreenContext Windows WPF + ScreenRecorderLib MVP checkpoint | Commit `1457395`. |
| 2026-09-11 21:56:07 | Windows spec-review blocker remediation checkpoint | Commit `e2581b5`; commit title records strict TDD. |
| 2026-09-11 22:08:44 | Completion, UI failure paths, and legal publishing hardening | Commit `d097f68`. |
| 2026-09-12 00:31:23 | Preferences and completion production-path coverage | Commit `4e4f771`. |
| 2026-09-12 10:36:06 | ScreenContext startup opens Settings | Commit `57ce553`, also the base named by the older pasted handoff. |
| 2026-09-12 21:58:48 | ScreenContext Windows r208, capability-based native ZoomIt integration | Commit `2b414a1`. Release notes record 127 passing unit tests and native capture probes. |
| 2026-09-12 22:17:34 | Openscreen checkout files present locally | `package.json` creation time; not an exact fork/clone operation timestamp. |
| 2026-09-12 22:49:10-22:49:18 | Initial Windows helper binaries present | Cursor-sampler write time and native-bin creation evidence. WGC was rebuilt later. |
| 2026-09-12 22:57:18 | Openscreen `release\1.5.0` directory created | Directory timestamp only; do not infer current functionality from its existence. |
| 2026-09-12 23:55:22 | Editor choice and direct export committed | Openscreen commit `3a464df`, latest current HEAD. |
| 2026-09-13 10:06:07 | `release\1.6.0` directory created | Filesystem checkpoint for the versioned release sequence. |
| 2026-09-13 10:43:16 | Recording preview documentation created | Filesystem timestamp; viewer work occurred across subsequent iterations. |
| 2026-09-13 11:04:28 | `release\1.7.0` directory created | Filesystem checkpoint. Installed executable later reports 1.7.0. |
| 2026-09-13 11:09:16 | Currently installed Openscreen executable written | Verified installed version 1.7.0 during this handoff. |
| 2026-09-13 12:06:20-12:14:50 | Native preview source added and revised | `preview.cpp` creation and last-write timestamps. |
| 2026-09-13 12:15:04 | Updated WGC helper compiled | Helper write time is newer than the native source used for this release. |
| 2026-09-13 12:19:30 | Source/package metadata aligned to 1.7.1 | Package and recording-preview document write times. |
| 2026-09-13 12:20:25-12:23:01 | Source viewer verification iterations | Isolated test profile timestamps. The later physical-camera run passed at about 12:23. |
| 2026-09-13 12:28-12:31 | HUD control order verification iterations | Isolated HUD test profile timestamps; After Recording moved left of Open Studio. |
| 2026-09-13 12:34:04-12:38:32 | Settings window and language relocation implemented/documented | New Settings component creation, later component/doc write times. |
| 2026-09-13 12:37-12:40 | Settings source verification | Test profile evidence and passing session results; included persistence and Cancel behavior. |
| 2026-09-13 before 12:48 | Production build and native-cache detour | Exact native-failure start not retained. Frontend build passed in about 1m11s. |
| 2026-09-13 12:48:08 | Electron packaging process started | Observed builder process StartTime. |
| 2026-09-13 12:48:19 | `release\1.7.1` created | Directory creation time. |
| 2026-09-13 12:53:11-12:53:14 | Packaged Openscreen executable generated/finalized | File creation/write times. |
| 2026-09-13 12:54:20 | First packaged Settings test started | Profile creation time; hidden-window Playwright screenshot timed out. |
| 2026-09-13 12:55:04-12:56:24 | Packaged native viewer/physical-webcam test | Profile timestamps; test passed, including native MP4 lifecycle checks. |
| 2026-09-13 12:55:15-12:55:34 | Installer and blockmap finalized | Installer write completed 12:55:30; blockmap write completed 12:55:34. |
| 2026-09-13 12:56:43 | Settings screenshot retest | First screenshot improved, external-editor screenshot still timed out; product assertions progressed. |
| 2026-09-13 12:58:14-12:58:32 | Final packaged Settings verification | Native Electron capture replaced hidden-window Playwright screenshots; test passed in 25.7s. |
| 2026-09-13 13:58 onward | This handoff's repository/artifact audit | Fresh checks of Git state, installed version, file times, hashes, and existing docs. |

Packaging elapsed approximately **7m26s**, from 12:48:08 to the final blockmap write at 12:55:34. This excludes the preceding production compilation and subsequent test iterations. The initial packaged two-test run lasted 2.3m and returned a failure because of the Settings screenshot timeout, while its viewer test passed. Final Settings retest passed separately.

## 3. How the Product Direction Changed

The initial project was ScreenContext on Windows: a compact WPF recording utility backed normally by ScreenRecorderLib (SRL). An older pasted handoff specified an extensive acceptance matrix and an isolated working checkout. It predates later changes and is historical context, not proof that all its requirements are now satisfied.

The user then approved native ZoomIt-derived capabilities with a strict routing rule: enable that backend only for GIF, real source blur, zoom, freeze, or presentation Blur needs; preserve ordinary SRL MP4 recording.

After examining the installed Openscreen application, the user designated Openscreen as the main program. Work shifted to importing meaningful workflows, especially after-recording editor/export choices and fast original-video export, while keeping the interface compact.

Important distinction: **ZoomIt is integrated in ScreenContext, not newly baked into Openscreen by this work.** Openscreen's native Windows viewer uses its WGC helper, not ScreenContext's ZoomIt backend.

Historical acceptance document:
`C:\Users\DELL\.codex\attachments\3b2f2153-0e66-4d37-82a9-658775d5d532\pasted-text.txt`.

It names an older isolated checkout and branch. Verify their existence/current state before relying on them. Do not treat the old base commit or ownership instructions as the current Openscreen implementation map.

## 4. ScreenContext Work and Remaining Boundaries

Canonical references, rather than repeating the full existing specification:
- `D:\REPOS\screencontext\windows\ZOOMIT_INTEGRATION.md`
- `D:\REPOS\screencontext\windows\releases\r208.md`
- `D:\REPOS\screencontext\windows\RECORDING_WORKFLOW_BASELINE.md`
- Commit `2b414a1` for r208 implementation/history.
- Historical remote requested by the user: https://github.com/wadib/ScreenContext

### Completed Implementation Direction

- CapabilityRecordingEngine selects SRL for ordinary MP4 and the native backend for the approved effect/GIF needs.
- Backend selection is fixed at recording start; effects do not switch an active SRL recording.
- Native path includes GIF encoding, MP4 encoding/audio support, centered zoom, freeze, and actual sampled source blur.
- r208 includes compact settings, presentation/theme/single-instance work and validation tools; see its commit and baseline document for specifics.
- Later uncommitted source exposes a desktop Area drag picker and topology-aware resolution.
- Later monitor labels include an application number, friendly name, resolution, device identifier, and Primary marker.
- Later global shortcuts: Ctrl+Alt+1 zoom, Ctrl+Alt+2 freeze, Ctrl+Alt+3 blur, Ctrl+Alt+4 GIF start/stop. Conflicts are reported; an active SRL MP4 is not silently rerouted.
- Area selections below minimum size or across physical gaps are rejected; stale saved areas require reselection after relevant layout changes.

### Do Not Overclaim

- The current ScreenContext worktree contains post-r208 changes and a large untracked vendor tree. Do not call all of it committed or packaged.
- Current documentation explicitly says this is not the full ZoomIt presentation UI.
- Its native capability path uses GDI desktop capture / PrintWindow, not WGC. Protected/GPU-only or unresponsive windows remain limitations.
- r208's 127-test result is historical release evidence, not a fresh execution during this handoff.
- Full six-monitor, mixed-DPI, cross-monitor output acceptance from the old handoff is not established by the evidence reviewed here.
- Monitor application numbers are not proven identical to Windows Display Settings numbers.
- ScreenContext's exact latest post-r208 package was not audited in this handoff. Openscreen 1.7.1 is the current delivery target.

## 5. Openscreen Work Delivered

Feature details already live in:
- `D:\REPOS\openscreen\docs\after-recording.md`
- `D:\REPOS\openscreen\docs\recording-preview.md`

### After-Recording Workflow

The original behavior always opened the editor after recording. A saved choice now selects Openscreen, another editor, or compact direct export. Invalid preferences fall back safely. External editors receive the saved screen file as an argument without a shell, not editable cursor/webcam sidecars.

The direct-export action is visibly named **Export & copy path**. It copies the successfully exported path; canceled/failed saves do not intentionally replace the clipboard. A clipboard error does not undo a valid export.

### Fast Original Export

The user questioned why ScreenContext exported faster. The difference was preserving an already encoded recording versus rendering and re-encoding styled output.

Added **Original MP4 (fast)** alongside **MP4 (styled)** and **GIF**:
- Original MP4 performs a disk copy without rendering/re-encoding.
- It preserves encoded video/audio, original dimensions, and frame rate.
- It cannot include separate webcam video, editable cursor layers, or editor styling. The UI discloses exclusions.
- WebM sources use the styled/GIF routes; the original-copy option requires an MP4.
- Copy/replace uses a temporary file and preserves existing data on failures; the source cannot be overwritten.
- Styled MP4/GIF continue using the existing editor/export engine, not a separate replacement encoder.

### Viewer, Cursor, and Webcam Corrections

The optional eye-controlled viewer was added so users can see the selected source before and during recording.

Initial issues reported by the user:
- Cursor stayed visible in the viewer despite the mouse toggle being off.
- Webcam did not appear even when enabled.

Implemented corrections:
- Dedicated native WGC preview capture, separate from recording, with no encoder/audio/output file.
- Low-resolution preview up to 960 x 540 at 15 fps.
- Cursor toggle drives native preview capture and persists a true hidden recording mode.
- Cursor-off recording fails closed if native capture is unavailable rather than using a browser fallback that may bake the cursor in.
- Webcam video is shared from the recorder's existing stream through local WebRTC, avoiding a second camera acquisition.
- Viewer close only releases its own capture/peer, not recording or host camera tracks.
- Source changes, stale asynchronous responses, minimize/restore, failures and retry are handled.
- Webcam placement follows the fitted source image, including portrait-source margins and compact resizing.
- A stale stop callback was fixed so recording completion retains the actual cursor mode and webcam sidecar state.
- Viewer capture exclusion is verified before content is visible, preventing recursive capture.
- Windows-only availability is intentional until other platforms have equivalent tested capture exclusion.

The viewer previews source/cursor visibility and default webcam placement, not all later editor effects or custom cursor styling. Original MP4 remains raw screen video even when the styled editor can composite a webcam sidecar.

### Clean Settings Interface

The user accepted the functional viewer, then asked for the control changes:
1. Place After Recording immediately left of Open Studio.
2. Rename it Settings.
3. Remove the toolbar language icon and move language selection into that window.

Delivered a compact native-framed Electron Settings window:
- Settings icon immediately left of Open Studio.
- Language select and When recording stops select.
- External-editor file picker appears only when needed.
- Save applies both settings; Cancel applies neither.
- Invalid external-editor configuration cannot be saved.
- Open renderer language updates through a storage event listener.
- All 13 supported launch locales have the new Settings labels.
- The redundant HUD language menu and its CSS/event plumbing were removed.
- Settings read/save/picker/close IPC is restricted to the Settings sender.

## 6. Code Navigation

Read existing docs first; this map identifies ownership boundaries without duplicating their full contents.

| Responsibility | Absolute Source Paths |
| --- | --- |
| HUD controls, cursor choice, viewer launch | `D:\REPOS\openscreen\src\components\launch\LaunchWindow.tsx` |
| Settings form | `D:\REPOS\openscreen\src\components\launch\SettingsWindow.tsx` |
| Viewer component/layout | `D:\REPOS\openscreen\src\components\launch\RecordingPreview.tsx`, `D:\REPOS\openscreen\src\lib\recordingPreview.ts` |
| Recording and preview ownership | `D:\REPOS\openscreen\src\hooks\useScreenRecorder.ts`, `D:\REPOS\openscreen\src\hooks\useRecordingPreview.ts`, `D:\REPOS\openscreen\src\hooks\useRecordingPreviewHost.ts`, `D:\REPOS\openscreen\src\hooks\useWebcamRecordingPreview.ts` |
| Cursor/session persistence | `D:\REPOS\openscreen\src\lib\recordingSession.ts` |
| Native preview process | `D:\REPOS\openscreen\electron\recording\preview-capture.ts` |
| Native preview capture loop | `D:\REPOS\openscreen\electron\native\wgc-capture\src\preview.cpp`, `D:\REPOS\openscreen\electron\native\wgc-capture\src\preview.h`, `D:\REPOS\openscreen\electron\native\wgc-capture\src\main.cpp` |
| Native preview frames on renderer | `D:\REPOS\openscreen\src\lib\recordingPreviewCapture.ts` |
| Electron windows and capture protection | `D:\REPOS\openscreen\electron\windows.ts` |
| IPC/types/preload | `D:\REPOS\openscreen\electron\ipc\handlers.ts`, `D:\REPOS\openscreen\electron\preload.ts`, `D:\REPOS\openscreen\electron\electron-env.d.ts` |
| Preference validation/persistence | `D:\REPOS\openscreen\electron\afterRecording.ts` |
| Safe raw MP4 copy | `D:\REPOS\openscreen\electron\recording\original-export.ts` |
| Compact export/editor behavior | `D:\REPOS\openscreen\src\components\video-editor\DirectExportControls.tsx`, `D:\REPOS\openscreen\src\components\video-editor\VideoEditor.tsx` |
| Cross-window language propagation | `D:\REPOS\openscreen\src\contexts\I18nContext.tsx` |
| Dev Electron test harness | `D:\REPOS\openscreen\scripts\test-electron-dev.mjs` |
| Packaged regression tests | `D:\REPOS\openscreen\tests\e2e\after-recording.spec.ts`, `D:\REPOS\openscreen\tests\e2e\recording-preview.spec.ts` |

Repository-level launch localization is under `D:\REPOS\openscreen\src\i18n\locales`. Tests sit alongside the corresponding source modules. Inspect untracked files as well as `git diff`: the latter does not include newly added files.

## 7. Verification Record

### Earlier Source-Level Results

Session evidence before the final packaging:
- 41 focused after-recording regressions and isolated real MP4/GIF export validation were previously recorded; see after-recording documentation.
- 51 focused viewer/cursor/webcam-related tests passed during the earlier viewer work.
- Subsequent Settings validation: 11 tests across afterRecording, I18nContext, and useScreenRecorder passed.
- TypeScript, relevant Biome checks, and 13-locale Settings key checks passed.
- Source Electron Settings test exercised HUD ordering, removed Language icon, default choices, save/reopen, language propagation, Cancel, invalid external-editor guard, and application selection.
- Source physical C922 viewer test passed around 12:23.

These counts concern different scoped runs. They are not additive proof of a freshly passing complete repository suite.

### Packaged 1.7.1 Results

- Production TypeScript + Vite build passed.
- Electron-builder exited successfully and generated NSIS installer/blockmap.
- App runtime version assertion passed against package.json.
- Windows metadata: installer FileVersion/ProductVersion **1.7.1**; app FileVersion **1.7.1**, ProductVersion **1.7.1.0**.
- Packaged native helper hashes matched the tested source-bin helpers exactly.
- Packaged viewer E2E passed with the physical **C922 Pro Stream Webcam**. It verified changing source pixels, cursor visibility, real shared camera playback, source changes, compact fitting, exclusion affinity, minimize/restore, closing/reopening the viewer during native MP4 recording, and saved output/session state.
- Packaged Settings E2E passed in **25.7s** after the capture harness adjustment.
- Biome check of the modified Settings test passed.
- The external-editor Settings screenshot was opened for visual inspection; compact layout had no incoherent overlap.

### Test Failures and Honest Interpretation

1. During earlier HUD work, the broader direct-export E2E failed a global clipboard assertion after an expected same-source export failure. Initial successful export path copying had already passed. Clipboard/environment interference was suspected, not conclusively proven. Do not claim that entire broader suite passed after every later change.
2. First packaged Settings run timed out on Playwright screenshot capture of a HEADLESS-hidden window.
3. A showInactive adjustment allowed progress but the external-editor screenshot still timed out.
4. Final harness used Electron webContents.capturePage with stayHidden/stayAwake and a nonempty-image check; Settings passed.
5. Only test code changed for this packaging screenshot problem; the installer did not require regeneration for that harness edit.

Evidence profiles, which may be removed by ordinary temp cleanup:
- Packaged viewer: `C:\Users\DELL\AppData\Local\Temp\openscreen-recording-preview-iLYT79`.
- Final packaged Settings: `C:\Users\DELL\AppData\Local\Temp\openscreen-hud-order-ocLqdH`.
- Settings captures: `settings.png`, `settings-external.png` inside the latter directory.
- Earlier physical source viewer: `C:\Users\DELL\AppData\Local\Temp\openscreen-recording-preview-fxobxE`.

No complete cross-platform regression run, installer installation smoke test, or fresh exhaustive ScreenContext acceptance run was performed for the last build.

## 8. Build Detour and Reproducibility

Normal Windows command is `npm.cmd run build:win`. During the final request it failed while CMake attempted to recreate:

`D:\REPOS\openscreen\electron\native\wgc-capture\build\CMakeFiles\pkgRedirects`.

The directory was ordinary, not a reparse point, but ACL inspection was denied. Broad permissions changes or destructive cache cleanup were not attempted.

Why packaging could safely continue:
- Native source had already been rebuilt and physically tested earlier.
- WGC binary write time 12:15:04 was newer than preview source's final 12:14:50 write.
- Existing build/bin helper hashes matched exactly.
- No subsequent application-native source edit was made during packaging.
- Reused helpers were also validated inside the packaged application.

Actual successful commands, from `D:\REPOS\openscreen`:

~~~powershell
npm.cmd run build-vite
npx.cmd electron-builder --win --x64 --config.npmRebuild=false --publish never
~~~

This is a documented workaround for that build, not a reason to skip native compilation after future C++ changes. Resolve the cache permission issue or use a verified clean native build location before rebuilding changed native source.

Other nonfatal output included an ONNX eval warning and duplicate dependency warnings. Existing caption assets were cached and included. npmRebuild=false retained prebuilt native dependencies. Builder signing-step messages alone are not evidence of a trusted publisher certificate.

## 9. Exact Delivered Artifacts

Latest directory: `D:\REPOS\openscreen\release\1.7.1`.

- Installer: `D:\REPOS\openscreen\release\1.7.1\Openscreen-Windows-x64-1.7.1-Installer.exe`
- Portable executable: `D:\REPOS\openscreen\release\1.7.1\win-unpacked\Openscreen.exe`
- Blockmap: installer filename plus `.blockmap`.
- Installer size: **289,382,768 bytes** (about 276 MiB).
- Portable app executable size: **223,286,272 bytes**. It requires the rest of win-unpacked; the executable alone is not a standalone distribution.

SHA-256:

~~~text
Installer:
0D4D688D626CF31826A9B6121B47DC9E7BED8C7D467C840DB804B761F6F1DE4C

Portable Openscreen.exe:
FD3F45934315F7E39D032F3464E711FF7D1264DA5FFFDC330B3613AC225D3D5D

Packaged wgc-capture.exe:
504E901E3C3B895E624BF9AA97B5BD9445375ECECD3196A48525D97170D157ED

Packaged cursor-sampler.exe:
747DB3CB4227DE1E18FFE72033AB5D48A51E620115F382CE8BA36352BFBCEB7C
~~~

Version discipline requested explicitly by the user:
- Use real versions, not descriptive/ad hoc preview folder names.
- package.json and both root package-lock version entries must match.
- Preserve electron-builder output `release/${version}`.
- Installer filenames must include the version.
- Verify packaged runtime and Windows metadata before delivery.
- A built version is not an installed version; update installation using the versioned installer only when requested.
- Do not overwrite a delivered version silently when preparing future changed releases.

## 10. Git / Remote Handoff

Openscreen:
- origin: https://github.com/wadib/openscreen.git
- upstream: https://github.com/siddharthvaddem/openscreen.git
- main / HEAD: `3a464df`, committed 2026-09-12 23:55:22 +04:00.
- No new commit or push followed the latest feature/build work.
- Before adding this document, tracked diff covered **37 files**, **1,469 insertions**, **458 deletions**, plus numerous untracked source/test/doc files.
- Those counts exclude this handoff and do not include untracked file contents.
- Current local diff is the authority for post-commit implementation; preserve both tracked and untracked changes when preparing a commit.

ScreenContext:
- HEAD checkpoint `2b414a1` records r208.
- Current dirty changes include Area workflow, monitor labels, shortcuts, and vendor/source material.
- Do not accidentally stage that vendor tree or mix ScreenContext work into an Openscreen commit.

Historical requests to commit/push/fork occurred earlier in the conversation. Current remotes reflect the Openscreen fork, but this handoff did not fetch, inspect GitHub state, or initiate another fork.

## 11. Next-Session Checklist

1. Confirm the user is asking about Openscreen rather than ScreenContext.
2. Read project instructions, feature documents, Git status, tracked diff, and untracked source.
3. For interactive development, start the repo dev server and verify the actual listener; do not depend on the stale 5174 browser tab.
4. For packaged testing, use the delivered 1.7.1 executable with isolated userData.
5. If requested to install, use the versioned installer and verify the installed version afterward. Do not terminate unrelated app processes or an active recording.
6. If requested to commit/push, include intended new files and reviewed tracked changes; do not revert user work or stage unrelated historical/vendor content.
7. Investigate the CMake cache permissions before future native rebuilds. Never reuse these helpers after changing native source without a new build.
8. Recheck broader direct-export clipboard coverage under a controlled clipboard environment before claiming a complete regression pass.
9. Keep Windows preview exclusion, cursor-off fail-closed behavior, and camera/recording ownership boundaries intact.
10. Use a new version and deterministic release folder for subsequent changed builds.

### Fast Verification Commands

Run from `D:\REPOS\openscreen`:

~~~powershell
# Renderer/native source tests without installer packaging:
npm.cmd run test:e2e:dev -- tests/e2e/recording-preview.spec.ts --workers=1

# Add a physical-camera run when the camera is available:
$env:OPENSCREEN_TEST_REAL_CAMERA='1'

# Verify the existing packaged release without rebuilding development output:
$env:OPENSCREEN_TEST_EXECUTABLE='D:\REPOS\openscreen\release\1.7.1\win-unpacked\Openscreen.exe'
npx.cmd playwright test tests/e2e/after-recording.spec.ts tests/e2e/recording-preview.spec.ts --grep 'Settings is left|live viewer' --workers=1 --reporter=line
~~~

The grep intentionally excludes the broader export/clipboard test. Run that separately when validating export changes. The source dev harness may rebuild dist-electron for development; do not run it as the packaged-release verification command.

Tests launch their own isolated application and clean up their own captures/recordings. Do not substitute blanket process-name termination.

## 12. Suggested Skills

- **handoff-doc:** maintaining this transfer document and its backup.
- **vercel-react-best-practices:** React hook, shared-state, and UI lifecycle changes; available under `C:\Users\DELL\.codex\skills\react-best-practices\SKILL.md`.
- **frontend-design:** meaningful interface/layout changes, while preserving the existing restrained utility style.
- **browseros-neo:** browser work if needed; use the user's dedicated browser skill rather than guessing browser state.
- **computer-use:computer-use:** Windows installer/native interaction smoke testing when direct user-facing verification is needed.
- For historical macOS ScreenContext UI only, project guidance requests SwiftUI patterns and narrow AppKit interop. Confirm those skills are available before use; they are not required for the Windows work above.

Prefer existing Electron Playwright tests and native helpers for deterministic application verification. Skills do not replace evidence or make unverified acceptance requirements complete.

## 13. Handoff Files

Primary:
`D:\REPOS\openscreen\docs\PROJECT-HANDOFF-2026-09-13.md`

Identical backup:
`C:\Users\DELL\handoff\PROJECT-HANDOFF-2026-09-13.md`

This document is a dated snapshot, not a live promise that installed versions, Git state, temp evidence, or server availability remain unchanged.
