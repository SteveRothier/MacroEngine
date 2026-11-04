#Requires -Version 5.1
<#
.SYNOPSIS
  Sign a Caster MSIX with SignTool (local cert or CI PFX).

.PARAMETER MsixPath
  Path to the .msix produced by pack-msix.ps1

.PARAMETER PfxPath
  Certificate PFX. Defaults to $env:MSIX_PFX_PATH

.PARAMETER PfxPassword
  PFX password as SecureString. If omitted, built from $env:MSIX_PFX_PASSWORD

.PARAMETER TimestampUrl
  RFC3161 timestamp server (default DigiCert)

.EXAMPLE
  $env:MSIX_PFX_PATH = "C:\certs\caster.pfx"
  $env:MSIX_PFX_PASSWORD = "…"
  powershell -File scripts/sign-msix.ps1 -MsixPath src-tauri\target\release\bundle\msix\Caster_0.1.0.0_x64.msix

.EXAMPLE
  $pwd = Read-Host -AsSecureString "PFX password"
  powershell -File scripts/sign-msix.ps1 -MsixPath .\Caster.msix -PfxPath .\caster.pfx -PfxPassword $pwd

CI secrets (optional):
  MSIX_PFX_BASE64 — base64 of the PFX
  MSIX_PFX_PASSWORD — PFX password
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$MsixPath,
  [string]$PfxPath = $env:MSIX_PFX_PATH,
  [SecureString]$PfxPassword,
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $MsixPath)) {
  throw "Missing MSIX: $MsixPath"
}

if (-not $PfxPassword -and $env:MSIX_PFX_PASSWORD) {
  # Bridge CI / env secret into SecureString (avoid keeping a [string] param).
  $PfxPassword = ConvertTo-SecureString -String $env:MSIX_PFX_PASSWORD -AsPlainText -Force
}

$tempPfx = $null
if (-not $PfxPath -and $env:MSIX_PFX_BASE64) {
  $tempPfx = Join-Path $env:TEMP ("caster-msix-" + [guid]::NewGuid().ToString() + ".pfx")
  [IO.File]::WriteAllBytes($tempPfx, [Convert]::FromBase64String($env:MSIX_PFX_BASE64))
  $PfxPath = $tempPfx
}

if (-not $PfxPath -or -not (Test-Path $PfxPath)) {
  throw "Set -PfxPath or MSIX_PFX_PATH (or MSIX_PFX_BASE64 in CI)."
}
if (-not $PfxPassword -or $PfxPassword.Length -eq 0) {
  throw "Set -PfxPassword (SecureString) or MSIX_PFX_PASSWORD."
}

$signTool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\x64\\' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1

if (-not $signTool) {
  throw "signtool.exe not found — install Windows 10/11 SDK."
}

$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($PfxPassword)
try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  Write-Host "Signing $MsixPath with $($signTool.FullName)"
  # SignTool only accepts /p as a process argument (plain text unavoidable here).
  & $signTool.FullName sign /fd SHA256 /tr $TimestampUrl /td SHA256 /f $PfxPath /p $plainPassword $MsixPath
  if ($LASTEXITCODE -ne 0) { throw "SignTool failed with $LASTEXITCODE" }
  Write-Host "Signed OK: $MsixPath"
}
finally {
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  if ($tempPfx -and (Test-Path $tempPfx)) {
    Remove-Item -Force $tempPfx
  }
}
