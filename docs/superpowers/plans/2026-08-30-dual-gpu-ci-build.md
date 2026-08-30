# Dual GPU CI Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Windows Companion with Vulkan enabled for whisper.cpp and DirectML enabled for sherpa-onnx.

**Architecture:** Keep one Companion binary and one sequential processing path. Restore the Vulkan SDK needed by `whisper-rs-sys`, retain `SHERPA_ONNX_LIB_DIR` for the custom DirectML sherpa runtime, and use Ninja in CI so Vulkan shader generation does not invoke the failing Visual Studio tracker.

**Tech Stack:** GitHub Actions, PowerShell, Rust/Cargo, `whisper-rs`/whisper.cpp Vulkan, sherpa-onnx 1.13.6 DirectML, MSVC.

---

### Task 1: Restore the dual-backend Windows release build

**Files:**

- Modify: `.github/workflows/ci.yml:124-131,184-187,255-258`

- [x] **Step 1: Restore Vulkan prerequisites and CI-only CMake workaround**

Replace the current MSVC verification step with the Vulkan SDK installation and verification below. `CMAKE_GENERATOR=Ninja` keeps the Vulkan build enabled while avoiding the failing Visual Studio generator and its file tracker.

```yaml
- name: Install Vulkan SDK
  uses: jakoch/install-vulkan-sdk-action@v1
  with:
    vulkan_version: 1.4.357.0
    destination: C:\VulkanSDK
    install_runtime: true
    cache: true

- name: Verify Vulkan toolchain
  shell: pwsh
  run: |
    if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
      throw "MSVC compiler was not found on PATH"
    }
    Get-Command cl.exe -ErrorAction Stop | Out-Null
    if (-not $env:VULKAN_SDK) {
      throw "VULKAN_SDK was not exported by the Vulkan SDK action"
    }
    if (-not (Get-Command ninja.exe -ErrorAction SilentlyContinue)) {
      throw "Ninja was not found on PATH"
    }
    "CMAKE_GENERATOR=Ninja" >> $env:GITHUB_ENV
    "CMAKE_BUILD_PARALLEL_LEVEL=1" >> $env:GITHUB_ENV
    $required = @(
      (Join-Path $env:VULKAN_SDK "Include\vulkan\vulkan.h"),
      (Join-Path $env:VULKAN_SDK "Lib\vulkan-1.lib"),
      (Join-Path $env:VULKAN_SDK "Bin\glslc.exe")
    )
    foreach ($path in $required) {
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Vulkan SDK file not found: $path"
      }
    }
    Write-Output "VULKAN_SDK=$env:VULKAN_SDK"
```

- [x] **Step 2: Build with both Cargo features**

Change the Companion Cargo build command to:

```powershell
--features "vulkan,directml"
```

Change the Tauri publish arguments to:

```yaml
args: --target x86_64-pc-windows-msvc --features vulkan,directml
```

Do not remove DirectML DLL staging or serialized Tauri resource validation.

- [x] **Step 3: Validate the workflow syntax and diff**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [x] **Step 4: Commit and push**

```bash
git add .github/workflows/ci.yml docs/superpowers/plans/2026-08-30-dual-gpu-ci-build.md
git commit -m "fix(ci): build Companion with Vulkan and DirectML"
git push origin master
```

- [x] **Step 5: Monitor the resulting CI run**

Run:

```bash
gh run list --repo teppyboy/whisdom --limit 1 --json databaseId,headSha,status
```

Then monitor the returned run ID:

```bash
gh run watch <run-id> --repo teppyboy/whisdom --exit-status --interval 10
```

Expected: all jobs, including `Release Desktop Companion`, complete successfully. If the release job fails, inspect its exact failing log before the next minimal workflow edit.
