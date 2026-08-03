#requires -version 3
<#
.SYNOPSIS
    Installs SscSwitcher and registers it as the .ssc handler (per user, no admin).

.PARAMETER InstallFolder
    Where SscSwitcher.exe is copied.
    >>> DEFAULT INSTALL FOLDER PLACEHOLDER <<<
    This mirrors Defaults.InstallFolder in the C# source. Replace with the real
    folder you will provide later (or pass -InstallFolder on the command line).

.PARAMETER TargetFolder
    Optional. Pre-seed the "specific folder" that holds srcsig.exe and the active
    .ssc. If omitted, the user sets it in the config window.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\install.ps1
    powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -TargetFolder "C:\Tools\SrcSig"
#>
[CmdletBinding()]
param(
    [string]$InstallFolder = "$env:LOCALAPPDATA\SscSwitcher",
    [string]$TargetFolder  = "",
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$root  = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$build = Join-Path $root "build"
$exe   = Join-Path $build "SscSwitcher.exe"

if (-not $NoBuild -or -not (Test-Path $exe)) {
    Write-Host "Building..."
    & (Join-Path $PSScriptRoot "build.ps1") -OutDir $build
}
if (-not (Test-Path $exe)) { throw "Build output not found: $exe" }

New-Item -ItemType Directory -Force -Path $InstallFolder | Out-Null
$installed = Join-Path $InstallFolder "SscSwitcher.exe"
Copy-Item $exe $installed -Force
Write-Host "Copied to $installed"

# Optionally seed the config with the target folder.
if ($TargetFolder) {
    $cfgDir = Join-Path $env:APPDATA "SscSwitcher"
    New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
    $cfg = [ordered]@{
        targetFolder         = $TargetFolder
        activeFileName       = "active.ssc"
        srcSigExeName        = "srcsig.exe"
        backupOnSwap         = $true
        launchAfterSwap      = $true
        autoDetectActiveFile = $true
    }
    ($cfg | ConvertTo-Json) | Set-Content -Path (Join-Path $cfgDir "config.json") -Encoding UTF8
    Write-Host "Seeded config with target folder: $TargetFolder"
}

# Register the association + startup check (runs as the installed copy).
& $installed --register --silent
Write-Host ""
Write-Host "Installed. .ssc files are now handled by $installed"
Write-Host "Run it with no arguments to open the configuration window."
