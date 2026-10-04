# Quiet Recording

Status: included in the Windows 1.8.1 installer, built and tested on 2026-09-14.
Quiet recording was first added in 1.8.0; 1.8.1 improves Windows shutdown recovery.
The existing 1.7.1 installer does not include this addition.
This opt-in Settings checkbox defaults off. It suppresses OS notification popups
using a platform-specific adapter, not by muting recording audio or killing apps.

The recorder requests a confirmed quiet lease before starting capture. Unsupported
systems, missing permissions, or failed activation reject the start with an error.
Turn the setting off to retain the ordinary recording workflow.

Normal stop, cancellation, failed start, renderer destruction/crash, and app exit
release the lease. Each helper owns its restoration and watches its parent's stdin:
EOF also triggers restoration if Electron exits abruptly. A restoration failure is
reported, not silently treated as success. Check the OS quiet state if a helper,
desktop session, or machine itself crashes during restoration.

On Windows, a hidden detached Node host keeps the PowerShell restoration helper
outside Electron's terminating job. The helper additionally monitors the actual
Electron PID, so inherited pipe handles do not postpone restoration. Terminating
the entire process tree including the guardian can still prevent restoration.

## Windows

Uses the Windows Quiet Hours user-profile COM interface. It snapshots the selected
profile, changes an unrestricted profile to AlarmsOnly, confirms the selection,
and restores the snapshot only if the selected profile still matches its own
temporary value. Existing PriorityOnly/AlarmsOnly selections remain untouched.
Automatic Focus rules are not modified. Wallpaper, volume and power settings
are not changed.

This interface is undocumented and may change on Windows updates. Unknown profile
values, unavailable COM services, denied writes or failed confirmation are rejected.
The newer official FocusSessionManager start API is a Limited Access Feature.
The older ActiveProfile COM accessor is not implemented on the tested Windows
build and is deliberately not called.

A presentation-mode prototype was tested and rejected on this machine because
its notification-state read did not confirm activation. It is not the shipped
source adapter. Each unsuccessful prototype test was followed by a restored-state
check.

Microsoft references:
- https://github.com/focus-time/focus-time-app/blob/main/windows-dnd-msvc/windows-dnd/quiethours.idl
- https://learn.microsoft.com/en-us/uwp/api/windows.ui.shell.focussessionmanager

## macOS

Uses Apple's supported shortcuts CLI. One-time user-authorized setup is required.
Create three shortcuts with these exact names:
- Openscreen Quiet State: Get Current Focus; output off if none, dnd if Do Not
  Disturb is active, or other for any other active Focus. Output only that text.
- Openscreen Quiet On: enable Do Not Disturb until turned off, without prompts.
- Openscreen Quiet Off: disable Do Not Disturb, without prompts.

Grant the Shortcuts permissions when first running them. Quiet mode is unavailable
until the required shortcuts exist and the state shortcut produces valid output.
Previously active Focus modes are left untouched. On release, the adapter disables
only a DND mode it enabled, and leaves a different currently active Focus intact.
Focus sharing with other Apple devices follows the user's macOS configuration.

Reference: https://support.apple.com/guide/shortcuts-mac/apd455c82f02/mac

## Linux

Requires a graphical GNOME/Unity or KDE session and python3.
- GNOME/Unity: uses the writable org.gnome.desktop.notifications show-banners key
  through gsettings. Previously disabled banners stay disabled. Restore occurs
  only if the current setting still equals the suppressed value.
- KDE: additionally requires the desktop's dbus-python module. The notification
  server must expose Inhibit/UnInhibit. A private persistent D-Bus connection owns
  the inhibition cookie; releasing it never clears another application's lease.
  Connection loss also allows KDE to release this application's inhibition.

Other Linux desktops and notification daemons are deliberately unavailable until
an equivalent verified adapter is implemented. Do not use GNOME settings merely
because gsettings exists on a different desktop.

References:
- https://github.com/GNOME/gsettings-desktop-schemas/blob/master/schemas/org.gnome.desktop.notifications.gschema.xml.in
- https://sources.debian.org/src/plasma-workspace/4%3A5.27.5-2%2Bdeb12u2/libnotificationmanager/dbus/org.freedesktop.Notifications.xml

## Limits and Validation

OS-level suppression cannot guarantee silence from alerts an app draws itself,
emergency/critical notifications, alarms, or notification sounds on every desktop.
No network, security, update, or application-service settings are disabled.
Compare-and-restore avoids replacing an observably different user state, but a
user manually choosing the same value as the temporary state is indistinguishable.

On 2026-09-14, 25 focused tests passed, including a real Windows user-profile
activation/restoration cycle. Settings source E2E passed for Save/reopen/Cancel
and disabling quiet mode while retaining the editor choice. Linux Python and
macOS shell helpers passed syntax validation on Windows.
The focused Windows recording lifecycle E2E passed in 27.0 seconds: quiet mode
was checked during native capture, a real MP4 was saved, and the previous profile
was verified after stop. A separate process-termination recovery E2E passed in
12.0 seconds; no capture was started in that destructive test.
That earlier test targeted Playwright's Windows command-shell launcher. It is
superseded by the 1.8.1 test that explicitly terminates the actual Electron PID.
Activation IPC is restricted to the recorder HUD, not Settings or Studio.

The broader viewer E2E failed its hardware-cursor pixel assertion before capture
began. That run is not a full viewer pass and did not exercise quiet recording.

Controller tests cover platform selection, confirmation, error handling,
idempotence, late/canceled starts and restoration failure. Native notification
behavior still requires testing on each supported OS/desktop. Automated tests
with mocked adapters are not proof of native macOS or Linux functionality.

Windows 1.8.0 packaged validation: all four focused E2Es passed in 1.5 minutes,
covering runtime version and Settings persistence, styled MP4/GIF and original
MP4 export, native quiet recording with restoration after stop, and restoration
after termination of an isolated recorder process. No installed app was replaced.

Windows 1.8.1 validation: 30 focused tests, six source E2Es and seven packaged E2Es
passed. Packaged validation took 1.7 minutes and includes actual Electron-PID
termination, capture-helper termination, stale/repeated Stop, dashboard z-order
without focus theft, Settings/version and MP4/GIF/original-MP4 export.
