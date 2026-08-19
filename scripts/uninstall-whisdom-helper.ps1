[CmdletBinding()]
param(
  [switch]$MachineWide,
  [switch]$RemoveCache
)

$ErrorActionPreference = "Stop"
if ($MachineWide) {
  $installDir = Join-Path $env:ProgramFiles "Whisdom Helper"
} else {
  $installDir = Join-Path $env:LOCALAPPDATA "Programs\Whisdom Helper"
}

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
Remove-ItemProperty -Path $runKey -Name "WhisdomHelper" -ErrorAction SilentlyContinue
if (Test-Path $installDir) {
  Remove-Item -Recurse -Force $installDir
}

if ($RemoveCache) {
  $cacheDir = Join-Path $env:LOCALAPPDATA "Whisdom\Helper"
  if (Test-Path $cacheDir) {
    Remove-Item -Recurse -Force $cacheDir
  }
}

Write-Output "Removed: $installDir"
Write-Output "Cache removed: $($RemoveCache.IsPresent)"
