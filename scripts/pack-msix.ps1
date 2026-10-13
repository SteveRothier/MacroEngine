#Requires -Version 5.1
<#
.SYNOPSIS
  Assemble a sideloadable MSIX for Caster from a Tauri release build.

.DESCRIPTION
  Tauri 2 bundles NSIS/MSI only. This script stages the release exe + icons +
  AppxManifest (runFullTrust), then calls MakeAppx.exe if the Windows SDK is present.

.PARAMETER Configuration
  Cargo profile folder under target/ (default: release)

.EXAMPLE
  npm run tauri build
  powershell -File scripts/pack-msix.ps1
#>
param(
  [string]$Configuration = "release"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$tauri = Join-Path $root "src-tauri"
$exe = Join-Path $tauri "target\$Configuration\caster.exe"
$manifestSrc = Join-Path $PSScriptRoot "msix\AppxManifest.xml"
$stage = Join-Path $tauri "target\$Configuration\msix-stage"
$outDir = Join-Path $tauri "target\$Configuration\bundle\msix"
$outMsix = Join-Path $outDir "Caster_0.1.0.0_x64.msix"

if (-not (Test-Path $exe)) {
  throw "Missing $exe — run `npm run tauri build` first."
}
if (-not (Test-Path $manifestSrc)) {
  throw "Missing manifest template $manifestSrc"
}

Write-Host "Staging MSIX payload → $stage"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path $stage | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage "Assets") | Out-Null

Copy-Item $exe (Join-Path $stage "caster.exe")
Copy-Item $manifestSrc (Join-Path $stage "AppxManifest.xml")

$icons = Join-Path $tauri "icons"
foreach ($name in @(
    "StoreLogo.png",
    "Square44x44Logo.png",
    "Square150x150Logo.png",
    "Square310x310Logo.png"
  )) {
  $src = Join-Path $icons $name
  if (-not (Test-Path $src)) { throw "Missing icon $src" }
  Copy-Item $src (Join-Path $stage "Assets\$name")
}

$makeAppx = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter MakeAppx.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\x64\\' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1

New-Item -ItemType Directory -Path $outDir -Force | Out-Null

if (-not $makeAppx) {
  Write-Warning "MakeAppx.exe not found (install Windows 10/11 SDK)."
  Write-Host "Staged package root: $stage"
  Write-Host "Create the MSIX with MSIX Packaging Tool or:"
  Write-Host "  MakeAppx pack /d `"$stage`" /p `"$outMsix`""
  exit 0
}

Write-Host "Using $($makeAppx.FullName)"
& $makeAppx.FullName pack /d $stage /p $outMsix /o
if ($LASTEXITCODE -ne 0) { throw "MakeAppx failed with $LASTEXITCODE" }

Write-Host "Wrote $outMsix"
Write-Host "Sideload (dev mode): Add-AppxPackage -Path `"$outMsix`""
Write-Host "Sign with your cert before Store upload / broad sideload."
