[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ModelDir,
    [string]$WavPath,
    [string]$BundleDir,
    [string]$TargetDir
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if (-not $BundleDir) { $BundleDir = Join-Path $repo "native\sherpa-directml" }
if (-not $TargetDir) { $TargetDir = Join-Path $repo ".tmp\sherpa-smoke-target" }
$libDir = Join-Path $BundleDir "lib"
if (-not (Test-Path -LiteralPath $ModelDir -PathType Container)) { throw "Model directory missing: $ModelDir" }
foreach ($name in @("encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt")) {
    if (-not (Test-Path -LiteralPath (Join-Path $ModelDir $name) -PathType Leaf)) { throw "Model file missing: $name" }
}
if (-not $WavPath) {
    $WavPath = Join-Path $ModelDir "test_wavs\0.wav"
}
if (-not (Test-Path -LiteralPath $WavPath -PathType Leaf)) { throw "WAV file missing: $WavPath" }

$env:SHERPA_ONNX_LIB_DIR = (Resolve-Path $libDir).Path
$env:CARGO_TARGET_DIR = $TargetDir
$env:SHERPA_SMOKE_MODEL_DIR = (Resolve-Path $ModelDir).Path
$env:SHERPA_SMOKE_WAV = (Resolve-Path $WavPath).Path

$cargo = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
if (-not (Test-Path -LiteralPath $cargo -PathType Leaf)) { $cargo = "cargo.exe" }
& $cargo run --manifest-path (Join-Path $repo ".tmp\directml-smoke\Cargo.toml") --release
if ($LASTEXITCODE -ne 0) { throw "Smoke probe failed: $LASTEXITCODE" }
