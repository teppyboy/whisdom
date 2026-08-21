[CmdletBinding()]
param(
    [switch]$CpuOnly,
    [string]$TargetDir = "F:\w-latest-companion"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $repo "companion\src-tauri\Cargo.toml"
$destination = Join-Path $repo "dist\bin\whisdom-companion.exe"

if (-not $CpuOnly) {
    if (-not $env:VULKAN_SDK) {
        $env:VULKAN_SDK = "E:\VulkanSDK\1.4.357.0"
    }
    $features = @("--features", "vulkan")
} else {
    $features = @()
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
$env:CARGO_TARGET_DIR = $TargetDir

Push-Location (Join-Path $repo "companion\src-tauri")
try {
    & cargo build --release --manifest-path $manifest @features
    if ($LASTEXITCODE -ne 0) {
        throw "Companion build failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

$binary = Join-Path $TargetDir "release\whisdom-companion.exe"
if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
    throw "Built companion binary not found: $binary"
}

Copy-Item -LiteralPath $binary -Destination $destination -Force
$hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
$item = Get-Item -LiteralPath $destination
Write-Output "Copied: $($item.FullName)"
Write-Output "Size: $($item.Length) bytes"
Write-Output "SHA-256: $hash"
