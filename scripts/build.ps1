#requires -version 3
<#
.SYNOPSIS
    Builds SscSwitcher.exe.

.DESCRIPTION
    Tries, in order: the .NET Framework C# compiler (csc.exe, always present on
    Windows 10/11 and needs no SDK), then `dotnet build`, then MSBuild.
    Produces build\SscSwitcher.exe by default.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\build.ps1
#>
[CmdletBinding()]
param(
    [string]$OutDir = (Join-Path $PSScriptRoot "..\build"),
    [ValidateSet("Auto", "Csc", "Dotnet", "MSBuild")]
    [string]$Method = "Auto"
)

$ErrorActionPreference = "Stop"
$root     = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$src      = Join-Path $root "src\SscSwitcher"
$proj     = Join-Path $src  "SscSwitcher.csproj"
$manifest = Join-Path $src  "Properties\app.manifest"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$exe = Join-Path $OutDir "SscSwitcher.exe"

function Build-Csc {
    $candidates = @(
        "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
        "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
    )
    $csc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $csc) { throw "csc.exe (.NET Framework 4.x) not found." }

    $sources = Get-ChildItem -Path $src -Recurse -Filter *.cs | ForEach-Object { $_.FullName }
    $refs = @(
        "System.dll",
        "System.Core.dll",
        "System.Windows.Forms.dll",
        "System.Drawing.dll",
        "System.Runtime.Serialization.dll"
    )

    $cscArgs = @(
        "/nologo", "/noconfig", "/target:winexe", "/platform:anycpu",
        "/out:$exe", "/win32manifest:$manifest"
    )
    $cscArgs += ($refs | ForEach-Object { "/reference:$_" })
    $cscArgs += $sources

    Write-Host "Compiling with $csc ..."
    & $csc $cscArgs
    if ($LASTEXITCODE -ne 0) { throw "csc failed (exit $LASTEXITCODE)." }
}

function Build-Dotnet {
    $dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
    if (-not $dotnet) { throw "dotnet not found." }
    & dotnet build $proj -c Release -o $OutDir
    if ($LASTEXITCODE -ne 0) { throw "dotnet build failed (exit $LASTEXITCODE)." }
}

function Build-MSBuild {
    $msbuild = Get-Command msbuild -ErrorAction SilentlyContinue
    if (-not $msbuild) { throw "msbuild not found." }
    & msbuild $proj /p:Configuration=Release "/p:OutDir=$OutDir\" /nologo /verbosity:minimal
    if ($LASTEXITCODE -ne 0) { throw "msbuild failed (exit $LASTEXITCODE)." }
}

$order = switch ($Method) {
    "Csc"     { @("Csc") }
    "Dotnet"  { @("Dotnet") }
    "MSBuild" { @("MSBuild") }
    default   { @("Csc", "Dotnet", "MSBuild") }
}

$built = $false
foreach ($m in $order) {
    try {
        & ("Build-$m")
        $built = $true
        break
    }
    catch {
        Write-Host "  $m unavailable/failed: $($_.Exception.Message)"
    }
}

if (-not $built)      { throw "All build methods failed. Install .NET Framework 4.8 dev tools, the .NET SDK, or Build Tools." }
if (-not (Test-Path $exe)) { throw "Build reported success but $exe was not produced." }

Write-Host ""
Write-Host "Built: $exe"
