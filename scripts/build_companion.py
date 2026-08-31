#!/usr/bin/env python3
"""Build the Windows Companion with optional Vulkan and DirectML support."""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REQUIRED_DIRECTML_DLLS = {
    "sherpa-onnx-c-api.dll",
    "onnxruntime.dll",
    "DirectML.dll",
}


def run(command: list[str], cwd: Path, env: dict[str, str]) -> None:
    print("+", " ".join(command))
    subprocess.run(command, cwd=cwd, env=env, check=True)


def resolve_target_dir(repo: Path, value: str) -> Path:
    target = Path(value).expanduser()
    if not target.is_absolute():
        target = repo / target
    try:
        return target.resolve()
    except OSError as error:
        raise RuntimeError(f"Invalid target directory: {value}") from error


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build and package the Whisdom Companion."
    )
    parser.add_argument(
        "--cpu-only",
        action="store_true",
        help="Build Whisper without Vulkan or DirectML.",
    )
    parser.add_argument(
        "--vulkan",
        action="store_true",
        help="Enable Vulkan for whisper.cpp.",
    )
    parser.add_argument(
        "--directml",
        action="store_true",
        help="Enable DirectML for sherpa-onnx.",
    )
    parser.add_argument(
        "--target-dir",
        default="companion/src-tauri/target",
        help="Cargo target directory; use a short path on Windows.",
    )
    return parser.parse_args()


def command_path(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    if os.name == "nt":
        roots = [
            Path(os.environ.get("PROGRAMFILES", "")),
            Path(os.environ.get("PROGRAMFILES(X86)", "")),
        ]
        candidates = [
            root / "CMake" / "bin" / "cmake.exe"
            for root in roots
        ] + [
            root / "Ninja" / "ninja.exe"
            for root in roots
        ]
        for candidate in candidates:
            if candidate.is_file() and candidate.name.lower() == f"{name}.exe":
                return str(candidate)
        if name == "cmake":
            vswhere = (
                Path(os.environ.get("PROGRAMFILES(X86)", ""))
                / "Microsoft Visual Studio"
                / "Installer"
                / "vswhere.exe"
            )
            if vswhere.is_file():
                result = subprocess.run(
                    [
                        str(vswhere),
                        "-latest",
                        "-products",
                        "*",
                        "-requires",
                        "Microsoft.VisualStudio.Component.VC.CMake.Project",
                        "-find",
                        "Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin\\cmake.exe",
                    ],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                discovered = result.stdout.strip().splitlines()
                if discovered and Path(discovered[0]).is_file():
                    return discovered[0]
    return None


def check_tools() -> None:
    for name in ("cargo", "pnpm"):
        if command_path(name) is None:
            raise RuntimeError(f"{name} is required and was not found on PATH")


def main() -> int:
    args = parse_args()
    if args.cpu_only and (args.vulkan or args.directml):
        raise RuntimeError("--cpu-only cannot be combined with --vulkan or --directml")
    if not args.cpu_only and not args.vulkan and not args.directml:
        args.vulkan = True
    if args.directml and os.name != "nt":
        raise RuntimeError("DirectML is only available on Windows")

    repo = Path(__file__).resolve().parent.parent
    companion = repo / "companion"
    config_path = companion / "src-tauri" / "tauri.conf.json"
    target_dir = resolve_target_dir(repo, args.target_dir)
    artifact_dir = repo / "dist" / "companion"
    env = os.environ.copy()
    env["CARGO_TARGET_DIR"] = str(target_dir)

    check_tools()
    cmake = command_path("cmake")
    if args.vulkan and cmake is None:
        raise RuntimeError("cmake is required for the Vulkan build")
    if args.vulkan and not env.get("VULKAN_SDK"):
        env["VULKAN_SDK"] = r"E:\VulkanSDK\1.4.357.0"
    if args.vulkan and not Path(env["VULKAN_SDK"]).is_dir():
        raise RuntimeError(f"VULKAN_SDK not found: {env['VULKAN_SDK']}")
    ninja = command_path("ninja")
    if args.vulkan and platform.system() == "Windows" and ninja is None:
        raise RuntimeError("ninja is required for the Windows Vulkan build")
    if cmake:
        env["PATH"] = str(Path(cmake).parent) + os.pathsep + env.get("PATH", "")
    if ninja:
        env["PATH"] = str(Path(ninja).parent) + os.pathsep + env["PATH"]
    if args.directml:
        bundle = repo / "native" / "sherpa-directml"
        lib_dir = bundle / "lib"
        manifest = bundle / "manifest.json"
        if not lib_dir.is_dir() or not manifest.is_file():
            raise RuntimeError(
                "DirectML bundle missing; run the existing "
                "scripts/build-sherpa-directml.ps1 first"
            )
        env["SHERPA_ONNX_LIB_DIR"] = str(lib_dir.resolve())

    features = []
    if args.vulkan:
        features.append("vulkan")
    if args.directml:
        features.append("directml")
    cargo_args = ["--features", ",".join(features)] if features else []

    artifact_dir.mkdir(parents=True, exist_ok=True)
    portable_dir = Path(tempfile.gettempdir()) / "whisdom-companion-portable"
    try:
        shutil.rmtree(portable_dir, ignore_errors=True)
        portable_dir.mkdir(parents=True)
    except OSError as error:
        raise RuntimeError(
            f"Could not prepare portable staging directory: {portable_dir}: {error}"
        ) from error

    run(
        [
            "cargo",
            "build",
            "--release",
            "--target-dir",
            str(target_dir),
            "--manifest-path",
            str(companion / "src-tauri" / "Cargo.toml"),
            *cargo_args,
        ],
        repo,
        env,
    )

    target_release = target_dir / "release"
    target_candidates = sorted(
        path for path in target_dir.glob("*/release") if path.is_dir()
    )
    if not target_release.is_dir() and target_candidates:
        target_release = target_candidates[0]
    binary_name = "whisdom-companion.exe" if os.name == "nt" else "whisdom-companion"
    binary = target_release / binary_name
    if not binary.is_file():
        raise RuntimeError(f"Companion binary not found: {binary}")

    if args.directml:
        bundle_bin = repo / "native" / "sherpa-directml" / "bin"
        for source in sorted(bundle_bin.glob("*.dll")):
            shutil.copy2(source, target_release / source.name)
    runtime_files = sorted(
        {
            path
            for pattern in ("*.dll", "*.so", "*.dylib")
            for path in target_release.glob(pattern)
            if path.is_file()
        }
    )
    if not runtime_files:
        raise RuntimeError(f"No runtime libraries found in {target_release}")
    if os.name == "nt" and not (target_release / "sherpa-onnx-c-api.dll").is_file():
        raise RuntimeError("Required sherpa-onnx-c-api.dll is missing")
    if args.directml:
        missing = sorted(
            name
            for name in REQUIRED_DIRECTML_DLLS
            if not (target_release / name).is_file()
        )
        if missing:
            raise RuntimeError(
                f"Required DirectML DLLs are missing: {', '.join(missing)}"
            )

    original_config = config_path.read_text(encoding="utf-8")
    try:
        config = json.loads(original_config)
        config["bundle"]["resources"] = {
            str(library): library.name for library in runtime_files
        }
        config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
        bundle_name = {
            "Windows": "nsis",
            "Linux": "appimage",
            "Darwin": "dmg",
        }.get(platform.system())
        if bundle_name is None:
            raise RuntimeError(f"Unsupported host platform: {platform.system()}")
        run(
            [
                "pnpm",
                "exec",
                "tauri",
                "build",
                "--bundles",
                bundle_name,
                *cargo_args,
            ],
            companion,
            env,
        )
    finally:
        config_path.write_text(original_config, encoding="utf-8")

    bundle_dir = target_release / "bundle"
    bundle_name = {
        "Windows": "nsis",
        "Linux": "appimage",
        "Darwin": "dmg",
    }.get(platform.system())
    if bundle_name is None:
        raise RuntimeError(f"Unsupported host platform: {platform.system()}")
    bundle_files = sorted(
        path
        for path in (bundle_dir / bundle_name).glob("*")
        if path.is_file() and not path.name.endswith(".sig")
    )
    if not bundle_files:
        raise RuntimeError(f"Native bundle not found in {bundle_dir / bundle_name}")
    for bundle_file in bundle_files:
        shutil.copy2(bundle_file, artifact_dir / bundle_file.name)

    shutil.copy2(binary, portable_dir / binary.name)
    for library in runtime_files:
        shutil.copy2(library, portable_dir / library.name)
    portable_zip = artifact_dir / "Whisdom-Companion-portable.zip"
    shutil.make_archive(str(portable_zip.with_suffix("")), "zip", portable_dir)

    for artifact in (*bundle_files, portable_zip):
        print(f"{artifact}\t{artifact.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
