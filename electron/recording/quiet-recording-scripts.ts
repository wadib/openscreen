import path from "node:path";

const windows = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$changed = $false
$off = 'Microsoft.QuietHoursProfile.Unrestricted'
$priority = 'Microsoft.QuietHoursProfile.PriorityOnly'
$target = 'Microsoft.QuietHoursProfile.AlarmsOnly'
function Emit($value) { try { [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress)); [Console]::Out.Flush() } catch { } }
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
// ABI reference: focus-time/focus-time-app, windows-dnd/quiethours.idl (Rafael Rivera, MIT).
[ComImport, Guid("6bff4732-81ec-4ffb-ae67-b6c1bc29631f"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IQuietProfile {
  [PreserveSig] int GetSelected(out IntPtr profile);
  [PreserveSig] int SetSelected([MarshalAs(UnmanagedType.LPWStr)] string profile);
}
public static class QuietState {
  static object Create() {
    return Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("f53321fa-34f8-4b7f-b9a3-361877cb94cf")));
  }
  public static string Read() {
    object obj = Create();
    try {
      IntPtr ptr;
      int hr = ((IQuietProfile)obj).GetSelected(out ptr);
      Marshal.ThrowExceptionForHR(hr);
      try { return Marshal.PtrToStringUni(ptr); } finally { Marshal.FreeCoTaskMem(ptr); }
    } finally { Marshal.FinalReleaseComObject(obj); }
  }
  public static void Set(string profile) {
    object obj = Create();
    try { Marshal.ThrowExceptionForHR(((IQuietProfile)obj).SetSelected(profile)); }
    finally { Marshal.FinalReleaseComObject(obj); }
  }
}
'@
  $previous = [QuietState]::Read()
  foreach ($profile in @($previous)) {
    if ($profile -ne $off -and $profile -ne $priority -and $profile -ne $target) { throw 'Windows returned an unsupported quiet-hours profile' }
  }
  if ($env:OPENSCREEN_QUIET_PROBE -ne '1' -and $previous -eq $off) {
    $changed = $true
    [QuietState]::Set($target)
    $confirmed = $false
    for ($i = 0; $i -lt 30; $i++) {
      if ([QuietState]::Read() -eq $target) { $confirmed = $true; break }
      Start-Sleep -Milliseconds 100
    }
    if (-not $confirmed) { throw 'Windows did not enable quiet mode; recording was not started' }
  }
  Emit @{ ready = $true; backend = 'Windows Focus / Quiet Hours'; changed = $changed; previousProfile = $previous }
  if ($env:OPENSCREEN_QUIET_PROBE -ne '1') {
    $parent = [System.Diagnostics.Process]::GetProcessById([int]$env:OPENSCREEN_QUIET_PARENT_PID)
    $reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput())
    $inputFinished = $reader.ReadToEndAsync()
    while (-not $inputFinished.IsCompleted -and -not $parent.HasExited) { Start-Sleep -Milliseconds 100 }
  }
} catch {
  Emit @{ error = $_.Exception.Message }
} finally {
  if ($changed) {
    try {
      if ([QuietState]::Read() -eq $target) {
        [QuietState]::Set($previous)
        if ([QuietState]::Read() -ne $previous) { throw 'Windows did not restore the previous quiet-hours profile' }
      }
      Emit @{ restored = $true; profile = [QuietState]::Read() }
    } catch { Emit @{ error = ('Could not restore Windows quiet mode: ' + $_.Exception.Message) }; exit 1 }
  }
}
`;

const mac = String.raw`
set -eu
changed=0
state() { /usr/bin/shortcuts run "Openscreen Quiet State"; }
restore() {
  if [ "$changed" = 1 ]; then
    current=$(state) || { printf '{"error":"Cannot read Focus state for restoration"}\n'; exit 1; }
    if [ "$current" = dnd ]; then
      /usr/bin/shortcuts run "Openscreen Quiet Off" >/dev/null || { printf '{"error":"Cannot restore macOS Focus"}\n'; exit 1; }
      current=$(state) || { printf '{"error":"Cannot confirm macOS Focus restoration"}\n'; exit 1; }
      [ "$current" = off ] || { printf '{"error":"macOS did not restore the previous Focus state"}\n'; exit 1; }
    fi
  fi
}
trap restore EXIT
trap 'exit 1' HUP INT TERM
for name in "Openscreen Quiet State" "Openscreen Quiet On" "Openscreen Quiet Off"; do
  /usr/bin/shortcuts list | grep -Fx "$name" >/dev/null || { printf '{"error":"Install the Openscreen Quiet State, On and Off shortcuts in macOS Shortcuts first"}\n'; exit 1; }
done
previous=$(state)
case "$previous" in off|dnd|other) ;; *) printf '{"error":"Quiet State must return off, dnd or other"}\n'; exit 1 ;; esac
if [ "$OPENSCREEN_QUIET_PROBE" != 1 ] && [ "$previous" = off ]; then
  changed=1
  /usr/bin/shortcuts run "Openscreen Quiet On" >/dev/null
  [ "$(state)" = dnd ] || { printf '{"error":"macOS did not enable Do Not Disturb"}\n'; exit 1; }
fi
printf '{"ready":true,"backend":"macOS Focus"}\n'
if [ "$OPENSCREEN_QUIET_PROBE" != 1 ]; then while IFS= read -r line; do :; done; fi
`;

const linux = String.raw`
import json, os, signal, subprocess, sys, xml.etree.ElementTree as ET
def emit(value):
    print(json.dumps(value), flush=True)
def command(*args):
    return subprocess.check_output(args, text=True, timeout=8).strip()
def interrupted(signum, frame):
    raise RuntimeError("Quiet recording helper interrupted")
signal.signal(signal.SIGTERM, interrupted)
signal.signal(signal.SIGINT, interrupted)
desktop = os.environ.get("XDG_CURRENT_DESKTOP", "").upper()
probe = os.environ.get("OPENSCREEN_QUIET_PROBE") == "1"
changed = False
bus = None
cookie = None
interface = None
schema = "org.gnome.desktop.notifications"
try:
    if "KDE" in desktop:
        import dbus
        bus = dbus.SessionBus(private=True)
        obj = bus.get_object("org.freedesktop.Notifications", "/org/freedesktop/Notifications")
        xml = dbus.Interface(obj, "org.freedesktop.DBus.Introspectable").Introspect(timeout=8)
        root = ET.fromstring(xml)
        methods = {method.attrib.get("name") for item in root.findall("interface") if item.attrib.get("name") == "org.freedesktop.Notifications" for method in item.findall("method")}
        if not {"Inhibit", "UnInhibit"}.issubset(methods):
            raise RuntimeError("This KDE notification server cannot inhibit notifications")
        interface = dbus.Interface(obj, "org.freedesktop.Notifications")
        if not probe:
            cookie = interface.Inhibit("openscreen", "Screen recording", dbus.Dictionary({}, signature="sv"), timeout=8)
        backend = "KDE notification inhibition"
    elif "GNOME" in desktop or "UNITY" in desktop:
        previous = command("gsettings", "get", schema, "show-banners")
        if previous not in ("true", "false") or command("gsettings", "writable", schema, "show-banners") != "true":
            raise RuntimeError("GNOME notification banners are not writable")
        if not probe and previous == "true":
            changed = True
            command("gsettings", "set", schema, "show-banners", "false")
            if command("gsettings", "get", schema, "show-banners") != "false":
                raise RuntimeError("GNOME did not suppress notification banners")
        backend = "GNOME notification banners"
    else:
        raise RuntimeError("Quiet recording supports GNOME and KDE Linux desktops")
    emit({"ready": True, "backend": backend})
    if not probe:
        for line in sys.stdin:
            pass
except Exception as error:
    emit({"error": str(error)})
finally:
    try:
        if cookie is not None:
            interface.UnInhibit(cookie, timeout=8)
        if changed and command("gsettings", "get", schema, "show-banners") == "false":
            command("gsettings", "set", schema, "show-banners", "true")
            if command("gsettings", "get", schema, "show-banners") != "true":
                raise RuntimeError("GNOME did not restore notification banners")
        if bus is not None:
            bus.close()
    except Exception as error:
        emit({"error": "Could not restore notifications: " + str(error)})
        sys.exit(1)
`;

export function quietRecordingCommand(platform: NodeJS.Platform) {
	if (platform === "win32") {
		return {
			file: path.win32.join(
				process.env.WINDIR ?? "C:\\Windows",
				"System32",
				"WindowsPowerShell",
				"v1.0",
				"powershell.exe",
			),
			args: [
				"-NoLogo",
				"-NoProfile",
				"-NonInteractive",
				"-EncodedCommand",
				Buffer.from(windows, "utf16le").toString("base64"),
			],
		};
	}
	if (platform === "darwin") return { file: "/bin/sh", args: ["-c", mac] };
	if (platform === "linux") return { file: "python3", args: ["-u", "-c", linux] };
	throw new Error("Quiet recording is unavailable on this operating system");
}
