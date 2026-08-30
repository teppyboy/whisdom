[CmdletBinding()]
param(
    [switch]$CpuOnly,
    [switch]$DirectML,
    [string]$TargetDir = ".\\companion\\src-tauri\\target"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$companion = Join-Path $repo "companion"
$configPath = Join-Path $companion "src-tauri\\tauri.conf.json"
$artifactDir = Join-Path $repo "dist\\companion"
$portableDir = Join-Path $env:TEMP "whisdom-companion-portable"
if ([IO.Path]::IsPathRooted($TargetDir)) {
    $targetRoot = $TargetDir
} else {
    $targetRoot = Join-Path $repo $TargetDir
}
$targetRoot = [IO.Path]::GetFullPath($targetRoot)

if ($CpuOnly -and $DirectML) {
    throw "Choose either -CpuOnly or -DirectML."
}

function Invoke-Checked {
    param(
        [string]$Command,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Command failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw "pnpm is required. Run: corepack enable"
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "Rust/Cargo is required. Install the MSVC Rust toolchain."
}

$backendFeature = $null
$nativeArgs = @()
if ($DirectML) {
    $nativeArgs = @("-DirectML", "-TargetDir", $targetRoot)
    $backendFeature = "directml"
} elseif ($CpuOnly) {
    $nativeArgs = @("-CpuOnly", "-TargetDir", $targetRoot)
} else {
    if (-not $env:VULKAN_SDK) {
        $env:VULKAN_SDK = "E:\\VulkanSDK\\1.4.357.0"
    }
    if (-not (Test-Path -LiteralPath $env:VULKAN_SDK -PathType Container)) {
        throw "Vulkan SDK not found: $env:VULKAN_SDK. Use -CpuOnly or set VULKAN_SDK."
    }
    $nativeArgs = @("-TargetDir", $targetRoot)
    $backendFeature = "vulkan"
}

New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
Remove-Item -LiteralPath $portableDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $portableDir | Out-Null

& (Join-Path $repo "scripts\\build-companion.ps1") @nativeArgs
if ($LASTEXITCODE -ne 0) {
    throw "Native Companion build failed with exit code $LASTEXITCODE."
}

$featureArgs = @()
if ($backendFeature) {
    $featureArgs = @("--features", $backendFeature)
}

$releaseDir = if (Test-Path (Join-Path $targetRoot "x86_64-pc-windows-msvc\release")) {
    Join-Path $targetRoot "x86_64-pc-windows-msvc\release"
} else {
    Join-Path $targetRoot "release"
}
if (-not (Test-Path -LiteralPath $releaseDir -PathType Container)) {
    throw "Cargo release directory not found: $releaseDir"
}
$originalConfig = [IO.File]::ReadAllText($configPath)
try {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $resources = @{}
    foreach ($dll in @(Get-ChildItem -LiteralPath $releaseDir -Filter "*.dll" -File)) {
        $resources[$dll.FullName] = $dll.Name
    }
    if ($resources.Count -eq 0) {
        throw "No runtime DLLs found in $releaseDir"
    }
    $config.bundle.resources = $resources
    $config | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $configPath

    $tauriArgs = @("exec", "tauri", "build", "--bundles", "nsis") + $featureArgs
    Invoke-Checked "pnpm" $tauriArgs $companion
} finally {
    [IO.File]::WriteAllText($configPath, $originalConfig)
}

$binary = Join-Path $releaseDir "whisdom-companion.exe"
if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
    throw "Built Companion binary not found: $binary"
}
$runtimeDlls = @(Get-ChildItem -LiteralPath $releaseDir -Filter "*.dll" -File)
if (-not ($runtimeDlls.Name -contains "sherpa-onnx-c-api.dll")) {
    throw "Required sherpa runtime DLL not found: $(Join-Path $releaseDir 'sherpa-onnx-c-api.dll')"
}

$nsisDir = Join-Path $releaseDir "bundle\\nsis"
$nsis = Get-ChildItem -LiteralPath $nsisDir -Filter "*.exe" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $nsis) {
    throw "NSIS installer not found under $targetRoot\\release\\bundle\\nsis"
}

$installer = Join-Path $artifactDir $nsis.Name
Copy-Item -LiteralPath $nsis.FullName -Destination $installer -Force
Copy-Item -LiteralPath $binary -Destination $portableDir -Force
Copy-Item -LiteralPath $runtimeDlls.FullName -Destination $portableDir -Force
$zip = Join-Path $artifactDir "Whisdom-Companion-portable.zip"
Compress-Archive -Path (Join-Path $portableDir "*") -DestinationPath $zip -Force

foreach ($path in @($installer, $zip)) {
    $item = Get-Item -LiteralPath $path
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    Write-Output "$($item.FullName)"
    Write-Output "  Size: $($item.Length) bytes"
    Write-Output "  SHA-256: $hash"
}
