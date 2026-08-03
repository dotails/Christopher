# SscSwitcher

A small native **Windows 10 / 11** app that takes over the `*.ssc` file
extension. When you open a `.ssc` file it swaps that file into a configured
folder (overwriting the active `.ssc` there) and immediately launches
`srcsig.exe` from that same folder. Run it on its own and it opens a small
configuration window instead.

- **Language / runtime:** C# + WinForms, targeting **.NET Framework 4.8**, which
  ships with Windows 10 (1903+) and Windows 11 — so there is nothing extra to
  install on the target machine.
- **No admin required:** the file association and startup check are registered
  under `HKEY_CURRENT_USER`, so installing never triggers a UAC prompt.

## How it behaves

The single executable does different things depending on how it is launched:

| Launched as | What happens |
| --- | --- |
| `SscSwitcher.exe` (no arguments) | Opens the **configuration window** (pick the target folder + settings, manage the association). |
| `SscSwitcher.exe some\path\file.ssc` (i.e. you double-click a `.ssc`) | Copies `file.ssc` over the **active `.ssc`** in the target folder (optionally backing up the old one), then launches `srcsig.exe` from that folder. |
| `SscSwitcher.exe --register` | Makes SscSwitcher the `.ssc` handler and enables the login **startup check**. Add `--silent` to skip the dialog. |
| `SscSwitcher.exe --unregister` | Removes the association and the startup check. |
| `SscSwitcher.exe --startup-check` | Silently re-asserts the association if something else took it over. Run automatically at each login. |

### The swap, precisely

When you open `whatever.ssc`:

1. The target folder is read from the config.
2. The **active file** is chosen: if *auto-detect* is on and the folder has
   exactly one `.ssc`, that one is the target; otherwise the configured
   **active file name** (default `active.ssc`) is used.
3. If *back up on swap* is on, the current active file is copied to
   `_ssc_backups\<name>_<timestamp>.ssc` first.
4. `whatever.ssc` is copied over the active file, **overwriting** it.
5. `srcsig.exe` (configurable) is launched with its working directory set to the
   target folder.

## Settings

Edit these in the configuration window; they are stored as JSON at
`%APPDATA%\SscSwitcher\config.json`.

| Setting | Meaning | Default |
| --- | --- | --- |
| Target folder | The "specific folder" holding `srcsig.exe` and the active `.ssc`. | `C:\Seismic_Source\Source_Signature\` |
| Active file name | The `.ssc` inside the folder that gets overwritten. | `active.ssc` |
| Auto-detect active file | If the folder has exactly one `.ssc`, overwrite that one. | on |
| Signing app | Executable launched after the swap. | `srcsig.exe` |
| Back up on swap | Save the overwritten file before replacing it. | on |
| Launch after swap | Start the signing app after swapping. | on |

## Placeholders to fill in later

You mentioned you'd give me the **default install folder** later. There are two
spots, and they should match:

- `src/SscSwitcher/Defaults.cs` → `InstallFolder` (marked `TODO`).
- `scripts/install.ps1` → the `-InstallFolder` default.

Both currently default to `%LOCALAPPDATA%\SscSwitcher`. You can also override at
install time with `-InstallFolder`.

## Get a ready-built installer (no build tools needed)

Every push builds `SscSwitcher.exe` **and** a double-click installer,
`SscSwitcher-Setup.exe`, on GitHub's own Windows runners — nothing to install
on your machine to get a working copy:

1. On GitHub, open the **Actions** tab of this repo.
2. Click the latest **Build SscSwitcher** run (for this branch).
3. Scroll to **Artifacts** and download `SscSwitcher`. It's a zip containing
   `SscSwitcher.exe` and `SscSwitcher-Setup.exe`.
4. Run `SscSwitcher-Setup.exe`. No admin rights needed — it installs per-user,
   registers the `.ssc` association, and enables the login startup check
   automatically. You can optionally open the configuration window right after
   install to confirm the target folder.

Pushing a git tag like `v1.0.0` additionally publishes a **GitHub Release**
with `SscSwitcher-Setup.exe` attached, for a stable, permanent download link.

## Build

On a Windows machine (no Visual Studio required — uses the built-in `csc.exe`):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
# -> build\SscSwitcher.exe
```

The build script falls back to `dotnet build` / MSBuild if you prefer those, and
`src\SscSwitcher\SscSwitcher.csproj` opens directly in Visual Studio.

## Install / uninstall

```powershell
# Build, copy to the install folder, register .ssc + startup check:
powershell -ExecutionPolicy Bypass -File scripts\install.ps1

# Optionally pre-set the target folder during install:
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -TargetFolder "C:\Tools\SrcSig"

# Remove everything:
powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1
```

## Antivirus / Windows Defender

`SscSwitcher.exe` is **not code-signed**. A freshly built, unsigned executable
downloaded as a zip and run within seconds can get caught by Windows Defender's
real-time protection or another antivirus's heuristics — sometimes it's removed
moments *after* the installer copies it, which shows up as something like:

```
Unable to execute file: ...\SscSwitcher.exe
CreateProcess failed; code 2. The system cannot find the file specified.
```

If you hit this, check **Windows Security → Virus & threat protection →
Protection history** for a quarantine entry, restore it, and add an exclusion
for the install folder (`%LOCALAPPDATA%\SscSwitcher` by default) or for
`SscSwitcher.exe` specifically. This is standard behavior for any new unsigned
binary, not a bug in the app; getting the executable code-signed is the
long-term fix if this keeps happening in your environment.

## Notes on file associations in Windows 10/11

Per-user `HKCU\Software\Classes` registration is what a non-admin app is allowed
to do, and it takes effect immediately. If a user has previously set an explicit
"default app" for `.ssc` in **Settings → Apps → Default apps**, Windows records a
protected `UserChoice` that an app cannot silently overwrite by design — in that
case Windows will prompt the user to confirm the change once. The bundled startup
check re-asserts our registration at each login to recover from other apps that
claim the extension.

## Project layout

```
src/SscSwitcher/
  Program.cs           entry point / command-line dispatch
  ConfigForm.cs        the configuration window (built in code, no .resx)
  SscHandler.cs        the swap-and-launch logic
  FileAssociation.cs   register/unregister + startup check (HKCU)
  AppConfig.cs         JSON settings under %APPDATA%
  Defaults.cs          <-- placeholders (install folder, defaults) live here
  Properties/
    AssemblyInfo.cs
    app.manifest       asInvoker, Win10/11 compat, per-monitor DPI
  SscSwitcher.csproj
scripts/
  build.ps1  install.ps1  uninstall.ps1
```
