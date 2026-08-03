; Inno Setup script for SscSwitcher.
; Produces a normal double-click Windows installer (SscSwitcher-Setup.exe):
;   - copies SscSwitcher.exe to the install folder
;   - registers the .ssc association + login startup check on install
;     (silently, via SscSwitcher.exe --register --silent)
;   - removes the association + startup check on uninstall
;   - no administrator rights required (per-user install + per-user registry)
;
; Built by .github/workflows/build.yml on GitHub's Windows runners via:
;   iscc installer\setup.iss
;
; Local build (on a Windows machine with Inno Setup installed):
;   iscc installer\setup.iss
; (build build\SscSwitcher.exe first, e.g. via scripts\build.ps1)

#define MyAppName "SscSwitcher"
#define MyAppVersion "1.0.0"
#define MyAppExeName "SscSwitcher.exe"
; Fixed GUID so upgrades/uninstalls recognize the same product across versions.
#define MyAppId "{{6B3F0F2E-6C0C-4C1E-9C3B-3D1E7C6D2B4A}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
; Per-user install: no admin/UAC prompt, matches the per-user (HKCU) registration.
PrivilegesRequired=lowest
DefaultDirName={localappdata}\SscSwitcher
DisableProgramGroupPage=yes
OutputBaseFilename=SscSwitcher-Setup
OutputDir=..\dist
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}

[Files]
Source: "..\build\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
; Register the .ssc handler + startup check right after install (silent, no dialog).
Filename: "{app}\{#MyAppExeName}"; Parameters: "--register --silent"; Flags: runhidden; StatusMsg: "Registering .ssc file association..."
; Optionally let the user open the config window (set the target folder) right away.
Filename: "{app}\{#MyAppExeName}"; Description: "Open {#MyAppName} configuration"; Flags: postinstall nowait skipifsilent unchecked

[UninstallRun]
; Clean up the association + startup check before files are removed.
Filename: "{app}\{#MyAppExeName}"; Parameters: "--unregister --silent"; Flags: runhidden
