[CmdletBinding()]
param(
    [string]$SourceDir,
    [string]$OutputDir,
    [string]$BuildDir,
    [string]$Generator = "Visual Studio 17 2022",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if (-not $SourceDir) { $SourceDir = Join-Path $repo ".tmp\sherpa-onnx-v1.13.6" }
if (-not $OutputDir) { $OutputDir = Join-Path $repo "native\sherpa-directml" }
if (-not $BuildDir) { $BuildDir = Join-Path $repo ".tmp\sherpa-directml-build" }
$sourceRevision = "1cb484af5e69d3c7803c1eb0b3b5ab8041e0e911"
$sourceTag = "v1.13.6"
$onnxRuntimeVersion = "1.14.1"
$onnxRuntimeSha256 = "c8ae7623385b19cd5de968d0df5383e13b97d1b3a6771c9177eac15b56013a5a"
$directMlVersion = "1.15.0"
$directMlSha256 = "10d175f8e97447712b3680e3ac020bbb8eafdf651332b48f09ffee2eec801c23"

if (-not (Test-Path -LiteralPath $SourceDir -PathType Container)) {
    $parent = Split-Path -Parent $SourceDir
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    git clone --depth 1 --branch $sourceTag https://github.com/k2-fsa/sherpa-onnx.git $SourceDir
    if ($LASTEXITCODE -ne 0) { throw "Could not fetch sherpa-onnx $sourceTag" }
    $head = (& git -C $SourceDir rev-parse HEAD | Out-String).Trim()
    if ($head -ne $sourceRevision) { throw "Fetched unexpected sherpa revision: $head" }
}
$sourceRoot = $SourceDir
if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot "CMakeLists.txt") -PathType Leaf)) {
    $sourceRoot = Join-Path $SourceDir "sherpa-onnx"
}
$actualRevision = (& git -C $sourceRoot rev-parse HEAD | Out-String).Trim()
if ($actualRevision -ne $sourceRevision) {
    throw "Expected sherpa-onnx $sourceRevision, found $actualRevision"
}
$dirty = (& git -C $sourceRoot status --porcelain --untracked-files=all | Out-String).Trim()
if ($dirty) {
    throw "Pinned sherpa-onnx source is modified or incomplete"
}
$sourceFiles = @(
    "CMakeLists.txt",
    "cmake/onnxruntime-win-x64-directml.cmake",
    "sherpa-onnx/c-api/CMakeLists.txt",
    "sherpa-onnx/csrc/session.cc"
)
foreach ($relativePath in $sourceFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $relativePath) -PathType Leaf)) {
        throw "Pinned sherpa-onnx source is incomplete: $relativePath"
    }
}

if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
    throw "cmake is required"
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "git is required"
}
if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
    throw "Run this script from a Visual Studio Developer PowerShell with x64 MSVC available"
}

if (-not $SkipBuild) {
    Remove-Item -LiteralPath $BuildDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $OutputDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $BuildDir, $OutputDir | Out-Null
}

$configureArgs = @(
    "-S", $sourceRoot,
    "-B", $BuildDir,
    "-G", $Generator,
    "-A", "x64",
    "-DCMAKE_BUILD_TYPE=Release",
    "-DCMAKE_INSTALL_PREFIX=$OutputDir",
    "-DBUILD_SHARED_LIBS=ON",
    "-DSHERPA_ONNX_ENABLE_DIRECTML=ON",
    "-DSHERPA_ONNX_ENABLE_PORTAUDIO=OFF",
    "-DSHERPA_ONNX_ENABLE_WEBSOCKET=OFF",
    "-DSHERPA_ONNX_ENABLE_BINARY=OFF",
    "-DSHERPA_ONNX_BUILD_C_API_EXAMPLES=OFF",
    "-DSHERPA_ONNX_ENABLE_TESTS=OFF",
    "-DSHERPA_ONNX_ENABLE_PYTHON=OFF",
    "-DSHERPA_ONNX_ENABLE_JNI=OFF",
    "-DSHERPA_ONNX_ENABLE_TTS=OFF",
    "-DSHERPA_ONNX_ENABLE_SPEAKER_DIARIZATION=OFF",
    "-DSHERPA_ONNX_ENABLE_RKNN=OFF",
    "-DSHERPA_ONNX_ENABLE_AXERA=OFF",
    "-DSHERPA_ONNX_ENABLE_AXCL=OFF",
    "-DSHERPA_ONNX_ENABLE_ASCEND_NPU=OFF",
    "-DSHERPA_ONNX_ENABLE_QNN=OFF",
    "-DSHERPA_ONNX_ENABLE_SPACEMIT=OFF",
    "-DSHERPA_ONNX_USE_STATIC_CRT=ON",
    "-DSHERPA_ONNX_USE_PRE_INSTALLED_ONNXRUNTIME_IF_AVAILABLE=OFF"
)

if (-not $SkipBuild) {
    Write-Output "Building sherpa-onnx revision $sourceRevision"
    Write-Output "ONNX Runtime DirectML $onnxRuntimeVersion; DirectML $directMlVersion"
    & cmake @configureArgs
    if ($LASTEXITCODE -ne 0) { throw "CMake configure failed: $LASTEXITCODE" }
    & cmake --build $BuildDir --config Release --parallel 1
    if ($LASTEXITCODE -ne 0) { throw "CMake build failed: $LASTEXITCODE" }
    & cmake --install $BuildDir --config Release
    if ($LASTEXITCODE -ne 0) { throw "CMake install failed: $LASTEXITCODE" }
}

$runtimeDir = Join-Path $OutputDir "bin"
$libDir = Join-Path $OutputDir "lib"
if (-not (Test-Path -LiteralPath $runtimeDir -PathType Container)) {
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
}
$libDlls = @(Get-ChildItem -LiteralPath $libDir -Filter "*.dll" -File)
foreach ($dll in $libDlls) {
    Copy-Item -LiteralPath $dll.FullName -Destination (Join-Path $runtimeDir $dll.Name) -Force
}
$dlls = @(Get-ChildItem -LiteralPath $runtimeDir -Filter "*.dll" -File)
if (-not $dlls) { throw "No runtime DLLs installed in $runtimeDir" }
$required = @("sherpa-onnx-c-api.dll", "onnxruntime.dll", "DirectML.dll")
foreach ($name in $required) {
    if (-not ($dlls.Name -contains $name)) {
        throw "Required DirectML runtime DLL missing: $(Join-Path $runtimeDir $name)"
    }
}
if ($SkipBuild) {
    $manifestPath = Join-Path $OutputDir "manifest.json"
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "Cannot refresh manifest: existing manifest missing"
    }
}
$importLibs = @(Get-ChildItem -LiteralPath $libDir -Filter "*.lib" -File)
if (-not ($importLibs.Name -contains "sherpa-onnx-c-api.lib") -or
    -not ($importLibs.Name -contains "onnxruntime.lib")) {
    throw "Installed import libraries are incomplete in $libDir"
}

$manifest = [ordered]@{
    sherpaTag = $sourceTag
    sherpaRevision = $sourceRevision
    onnxRuntimeVersion = $onnxRuntimeVersion
    onnxRuntimeSha256 = $onnxRuntimeSha256
    directMlVersion = $directMlVersion
    directMlSha256 = $directMlSha256
    target = "x86_64-pc-windows-msvc"
    dlls = @($dlls.Name | Sort-Object)
    dllSha256 = [ordered]@{}
}
foreach ($dll in $dlls) {
    $manifest.dllSha256[$dll.Name] = (Get-FileHash -LiteralPath $dll.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDir "manifest.json")
Write-Output "Installed runtime DLLs: $($dlls.Name -join ', ')"
Write-Output "Bundle: $OutputDir"
