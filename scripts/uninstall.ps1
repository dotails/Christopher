#requires -version 3
<#
.SYNOPSIS
    Removes the .ssc association + startup check and deletes the installed files.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1
#>
[CmdletBinding()]
param(
    [string]$InstallFolder = "$env:LOCALAPPDATA\SscSwitcher",
    [switch]$KeepConfig
)

$ErrorActionPreference = "SilentlyContinue"
$exe = Join-Path $InstallFolder "SscSwitcher.exe"

if (Test-Path $exe) {
    & $exe --unregister --silent
    Start-Sleep -Milliseconds 400   # let the process release its own file
}

if (Test-Path $InstallFolder) {
    Remove-Item $InstallFolder -Recurse -Force
    Write-Host "Removed $InstallFolder"
}

if (-not $KeepConfig) {
    $cfgDir = Join-Path $env:APPDATA "SscSwitcher"
    if (Test-Path $cfgDir) {
        Remove-Item $cfgDir -Recurse -Force
        Write-Host "Removed config $cfgDir"
    }
}

Write-Host "Uninstalled."
