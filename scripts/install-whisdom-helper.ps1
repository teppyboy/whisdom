[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BinaryPath,
  [switch]$MachineWide,
  [switch]$EnableStartup
)

$ErrorActionPreference = "Stop"
$source = (Resolve-Path $BinaryPath).Path
if (-not (Test-Path $source -PathType Leaf)) {
  throw "Helper binary not found: $source"
}

if ($MachineWide) {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Machine-wide installation requires Administrator rights."
  }
  $installDir = Join-Path $env:ProgramFiles "Whisdom Helper"
} else {
  $installDir = Join-Path $env:LOCALAPPDATA "Programs\Whisdom Helper"
}

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$target = Join-Path $installDir "whisdom-helper.exe"
Copy-Item -Force $source $target

if ($EnableStartup) {
  $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  New-Item -Path $runKey -Force | Out-Null
  Set-ItemProperty -Path $runKey -Name "WhisdomHelper" -Value ('"{0}"' -f $target)
}

Write-Output "Installed: $target"
Write-Output "Startup: $($EnableStartup.IsPresent)"
Write-Output "Cache: $env:LOCALAPPDATA\Whisdom\Helper"
