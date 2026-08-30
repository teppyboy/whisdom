[CmdletBinding()]
param(
    [switch]$CpuOnly,
    [switch]$DirectML,
    [string]$TargetDir = ".\companion\src-tauri\target"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $repo "companion\src-tauri\Cargo.toml"
$destination = Join-Path $repo "dist\bin\whisdom-companion.exe"

if ($CpuOnly -and $DirectML) {
    throw "Choose either -CpuOnly or -DirectML."
}
if ($DirectML) {
    $bundle = Join-Path $repo "native\sherpa-directml\lib"
    if (-not (Test-Path -LiteralPath $bundle -PathType Container)) {
        throw "DirectML bundle missing: run scripts/build-sherpa-directml.ps1 first"
    }
    $env:SHERPA_ONNX_LIB_DIR = (Resolve-Path $bundle).Path
    $features = @("--features", "directml")
} elseif (-not $CpuOnly) {
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

$releaseDir = Join-Path $TargetDir "release"
$binary = Join-Path $releaseDir "whisdom-companion.exe"
if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
    throw "Built companion binary not found: $binary"
}

$runtimeDlls = @(Get-ChildItem -LiteralPath $releaseDir -Filter "*.dll" -File)
if (-not ($runtimeDlls.Name -contains "sherpa-onnx-c-api.dll")) {
    throw "Required sherpa runtime DLL not found: $(Join-Path $releaseDir 'sherpa-onnx-c-api.dll')"
}
if ($DirectML) {
    $expectedManifest = Join-Path $repo "native\sherpa-directml\manifest.json"
    if (-not (Test-Path -LiteralPath $expectedManifest -PathType Leaf)) {
        throw "DirectML bundle manifest missing: run scripts/build-sherpa-directml.ps1 first"
    }
    foreach ($name in @("onnxruntime.dll", "DirectML.dll")) {
        if (-not ($runtimeDlls.Name -contains $name)) {
            throw "Required DirectML runtime DLL not found in Cargo output: $name"
        }
    }
}

Copy-Item -LiteralPath $binary -Destination $destination -Force
foreach ($dll in $runtimeDlls) {
    Copy-Item -LiteralPath $dll.FullName -Destination (Join-Path (Split-Path -Parent $destination) $dll.Name) -Force
}

$hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
$item = Get-Item -LiteralPath $destination
Write-Output "Copied: $($item.FullName)"
Write-Output "Size: $($item.Length) bytes"
Write-Output "SHA-256: $hash"
Write-Output "Runtime DLLs: $($runtimeDlls.Name -join ', ')"
