# Desktop Companion Multi-Engine ASR Design

**Status:** Proposed implementation baseline

**Date:** 2026-08-27

## Goal

Add one non-Whisper ASR choice to the Windows Desktop Companion without weakening the local-only picker boundary, verified-download policy, timestamped transcript/export contract, or Vietnamese Whisper path.

The first production choice is **NVIDIA Parakeet TDT 0.6B v3 INT8 through sherpa-onnx with DirectML on Windows**. When DirectML is unavailable or fails model initialization, use **NVIDIA NeMo-Speech.cpp through its C ABI** with Vulkan. CPU sherpa-onnx remains the final safe fallback. Neither replaces Whisper.

## Research decision

| Candidate                                       | Decision           | Reason                                                                                                               |
| ----------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Parakeet TDT 0.6B v3 via sherpa-onnx + DirectML | First Windows path | Offline Rust/Tauri path, documented DirectML build, INT8 artifact, timestamps, CC-BY-4.0.                            |
| NeMo-Speech.cpp Parakeet                        | Vulkan fallback    | Only researched Windows Vulkan route with official C ABI and word timestamps; early maturity, separate model bundle. |
| Moonshine English                               | Later evaluation   | Small and fast; needs separate ONNX Runtime/C API packaging or an immature Rust wrapper.                             |
| Canary-Qwen-2.5B                                | Excluded           | English-only, 2.5B, no proven Rust/Windows packaging or timestamp contract.                                          |
| Vosk                                            | Excluded           | Useful low-spec streaming fallback; not a quality-oriented replacement for Companion Whisper.                        |

Parakeet TDT v3 supports 25 European languages, including English, German, French, Spanish, Russian, and Ukrainian. It does **not** support Vietnamese. Its model card documents word- and segment-level timestamps and CC-BY-4.0 licensing. Sherpa-onnx documents a Windows executable, Rust API, and a fixed INT8 bundle containing `encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, and `tokens.txt`.

Sources:

- <https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3>
- <https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html>
- <https://k2-fsa.github.io/sherpa/onnx/rust-api/index.html>
- <https://k2-fsa.github.io/sherpa/onnx/tauri/vad-asr-file.html>

## Scope

### Included

- One pinned Parakeet TDT v3 INT8 Companion catalog entry.
- `sherpa-onnx` as the second native inference runtime.
- Windows DirectML execution for sherpa-onnx Parakeet, with DirectX 12 capability detection.
- NeMo-Speech.cpp C-ABI Vulkan fallback for a separately pinned Parakeet GGUF, with no Vulkan catalog exposure until acceptance gates pass.
- CPU sherpa-onnx final fallback.
- Engine-owned asset manifests and verified atomic multi-file installation.
- Per-model engine and language capability metadata.
- Server-side language enforcement plus EN/VI UI guidance.
- Timestamp normalization into existing `TranscriptSegment` records.
- Windows packaging, license notices, and benchmark evidence gates.

### Excluded

- Arbitrary Hugging Face model URLs, local model paths, engine settings, or plugins.
- Customer-facing sherpa-onnx Vulkan or WebGPU execution.
- Calling DirectML or D3D12 “Vulkan.”
- Automatic model routing or quality/speed marketing claims.
- Diarization, VAD-driven long-form redesign, live microphone transcription, or new processing modes.
- Replacing Whisper for Vietnamese.
- Changes to IndexedDB schema, transcript format, picker endpoints, SSE shape, queue behavior, or browser upload behavior.

## Architecture

```text
Browser model picker
  └─ catalog model ID + selected language only
       │
       ▼
Paired loopback API
  └─ validates opaque selection ID, catalog model ID, model-language pair
       │
       ▼
Common Companion runtime
  └─ FFmpeg conversion, queue, cancellation, chunk offsets, SSE, transcript assembly
       │
       ▼
Internal engine dispatcher
  ├─ whisper.cpp / whisper-rs: existing GGML models
  ├─ sherpa-onnx: DirectML, then CPU, Parakeet INT8 bundle
  └─ NeMo-Speech.cpp C ABI: Vulkan fallback, Parakeet GGUF
       │
       ▼
Timestamped `TranscriptSegment[]`
```

The browser never selects an engine or accelerator separately. The immutable catalog model ID determines the engine, asset manifest, supported language set, and Rust dispatch. The browser keeps sending only `{ selection_id, language, model }`. Before work starts, the Companion tries DirectML for the sherpa ONNX model, then a verified NeMo Vulkan runtime, then CPU sherpa. Capabilities and final SSE metadata report the actual backend (`directml`, `vulkan`, or `cpu`); they never infer it from a build feature.

## Rust boundaries

`server/src/helper/runtime.rs` remains the job owner. It preserves FFmpeg handling, fixed sequential work, cancellation, progress, queue state, offsets, temporary-file cleanup, and the existing SSE result contract.

A small internal `AsrEngine` enum in `server/src/helper/models.rs` replaces the assumption that every `NativeModel` is GGML. An engine dispatcher owns only three variable operations:

1. install the model's fixed, verified assets;
2. load or reuse the one currently selected engine/model runtime;
3. transcribe one PCM WAV chunk into `Vec<TranscriptSegment>`.

The Companion admits one job at a time already. Keep one tagged loaded runtime rather than introduce a runtime pool, plugin interface, factory, or concurrent model cache.

## Model assets and download safety

Parakeet is a multi-file bundle. Do not force it through the current single-file GGML download API and do not accept a floating archive URL.

The catalog will declare the immutable `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2` GitHub release asset (487,170,055 bytes; SHA-256 `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf`) and an exact extracted-file manifest for `encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, and `tokens.txt`. Installation downloads the archive into a sibling `.partial` directory, verifies its hash, extracts only listed safe paths, validates every extracted file hash and expected filename, then renames the directory atomically. Failure removes only that partial directory. Existing Whisper model locations remain intact.

Asset coordinates remain server-owned. The browser cannot send asset URLs, checksums, filenames, engine names, model directories, or inference options. Every redirect remains individually HTTPS/host validated. Cache clear keeps its idle-only refusal and unloads the tagged runtime before deletion.

## Language and timestamp rules

Each catalog model exposes an engine identifier, supported language codes, and auto-language support. The Parakeet entry exposes its documented 25-language set. The frontend shows an EN/VI incompatibility message before start; the API repeats validation authoritatively. Legacy Companion capability responses without this new metadata are treated as Whisper-only and remain usable.

Sherpa-onnx returns token text plus aligned token timestamps. The Parakeet adapter groups contiguous non-empty token text into readable word/phrase segments, uses the first/last grouped token boundaries, then validates that all segments are finite, non-negative, monotonic, non-empty, and bounded by the input chunk duration before adding the job offset. Invalid or absent timestamp output fails the job; it never saves a transcript with empty cue data.

The exact grouping rule is deliberately modest: trim/merge token pieces into words, attach punctuation to the preceding word, and cap a display segment at a sentence-ending punctuation mark, 12 words, or 12 seconds. This is a presentation grouping only; no timestamp is invented.

## Capability and UI contract

Keep the current generic model picker. Extend a model record with:

```text
engine: "whisper.cpp" | "sherpa-onnx" | "nemo-speech.cpp"
supported_languages: string[]
supports_auto_language: boolean
active_backend: "cpu" | "directml" | "vulkan"
```

Keep `HelperCapabilities.engine` as legacy informational data. Add `engines` only if the UI needs a summary; it is not an authority for dispatch. A current Companion sends complete per-model metadata. A current web app can still connect to an older Whisper-only Companion by inferring legacy Whisper behavior; the server stays authoritative for all constraints.

The selected Companion model remains ephemeral React state. `TranscriptDocument.modelId` stays opaque and `mode: "local-helper"` stays unchanged, so existing v1/v2 IndexedDB compatibility does not need migration.

UI labels are factual: “Parakeet TDT v3 (25 European languages)” and its download size. Do not say “faster” or “more accurate” until Whisdom benchmark evidence passes for the selected language and hardware class.

## Hardware and packaging

Build sherpa-onnx against ONNX Runtime DirectML for the first Windows GPU path. DirectML needs a DirectX 12 device, one sequential ONNX Runtime session, memory patterns disabled, and no concurrent `Run` calls on that session. The existing Companion global job gate already meets the run-serialization condition. Label the backend `directml`, never Vulkan. If DirectML device/session/model initialization fails, close it and continue; do not silently report GPU success.

Then try a bounded NeMo-Speech.cpp C-ABI Vulkan runtime with its separately pinned Parakeet GGUF artifact. Pin one source commit, GGUF hash, SDK headers, native DLLs, and `ggml-vulkan` dependencies. Build Windows with the documented Vulkan backend. Do not spawn its CLI or HTTP server; retain the Companion process boundary. It may become a fallback only after clean-package tests show requested `vulkan` selected, backend diagnostics show no CPU graph fallback, word timestamps/SRT/VTT remain valid, cancellation/GPU reset are safe, and a device matrix passes. If DirectML and verified Vulkan are unavailable or fail initialization, run the sherpa ONNX CPU runtime. Never use a Vulkan path that falls back to CPU while claiming Vulkan.

ONNX Runtime WebGPU/Dawn is not part of this fallback chain: sherpa-onnx has no supported Windows WebGPU/Vulkan route. The Windows installer/package must include selected sherpa-onnx/ONNX Runtime DirectML, NeMo-Speech/ggml Vulkan, and CPU DLLs and run without a developer `PATH` or SDK. Before release, include Apache-2.0 notices for sherpa-onnx/its distributed runtime components, CC-BY-4.0 Parakeet attribution, and all NeMo-Speech.cpp/ggml notices if the Vulkan fallback ships. Existing whisper.cpp, whisper-rs, and FFmpeg notices remain.

## Backend and benchmark release gates

No comparative claim ships without reproducible local benchmark evidence under `benchmarks/desktop-companion/` or equivalent. Measure cold/warm elapsed time, real-time factor, peak working set, WER against reference text, completion/cancellation correctness, and SRT/VTT validity for English plus German, French, and Spanish. Run 5-, 30-, and 60-minute media on the declared Windows DirectML, Vulkan, and CPU baselines. Report Vietnamese separately as Whisper-only coverage.

DirectML must prove a DirectX 12 device, required sequential session settings, no CPU-fallback claim, valid timestamps, and package launch. Vulkan must meet its separate NeMo-Speech.cpp gates. More engines or a generalized registry requires a separate design and benchmark gate.

## Error handling

- Unknown model ID, engine override, asset override, unsupported language, or unsupported auto detection: reject before consuming the selected source path.
- Any missing, altered, oversize, redirected-to-unapproved, or partially installed asset: fail before runtime load and remove only partial model assets.
- Package/DLL load failure: return a sanitized model-runtime error; do not claim a fallback.
- Invalid Parakeet token alignment or segments: terminal error; do not save incomplete export data.
- Cancellation: preserve current job/SSE terminal behavior. Stop between chunks at minimum; document if native recognition cannot be interrupted during one synchronous chunk.

## Validation

1. Catalog, asset-installer, language, token-segment, runtime dispatch, API strictness, and cache-clear unit tests.
2. TypeScript client parser, component language restriction, transcript persistence round-trip, and Companion UI tests.
3. Root typecheck, lint, test, build, and E2E; helper/server and Windows Companion release build.
4. Clean Windows x64 manual verification: first download, offline second run, paired native picker, source-path/log privacy, SSE terminal states, cancellation, cache-clear refusal during work, SRT/VTT exports, packaging DLL discovery, and license notices.
5. Benchmark gate before any quality/speed product language.
