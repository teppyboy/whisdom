# Faster Browser ASR — Research Decision & Plan

**Status:** Plan only. No implementation approved.

## Confirmed Requirements

1. Browser-local inference only.
2. Vietnamese support.
3. Native, meaningful timestamped segments for the result dialog and SRT/VTT.
4. Quality comparable to Whisper Large, faster than Whisper Large v3.

## Decision

**Do not add a new model now.**

`onnx-community/whisper-large-v3-turbo` is already in `src/features/transcription/models.ts` and is the only verified browser-local model meeting every requirement: multilingual Vietnamese, native timestamps, ONNX/Transformers.js compatibility, and large-v3-class quality at substantially faster inference.

No researched non-Whisper Hugging Face model meets all constraints today. Adding one would either remove Vietnamese support, worsen quality, require unsupported browser runtime work, or fake timestamps. None is acceptable.

## Candidates

| Model                                   | Speed / quality evidence                                       | Vietnamese                                           | Browser fit                                                                     | Timestamp fit                              | Decision                |
| --------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------- |
| `onnx-community/whisper-large-v3-turbo` | Optimized Whisper Large v3; 809M params; near-large-v3 quality | Yes                                                  | Existing Transformers.js ONNX path                                              | Native                                     | Keep; benchmark/promote |
| `Qwen/Qwen3-ASR-0.6B`                   | Mean WER 6.31 vs Turbo 7.30 on Open ASR leaderboard; RTFx 166  | Yes                                                  | No Transformers.js ASR architecture support; unofficial custom ONNX bundle only | Forced aligner excludes Vietnamese         | Defer                   |
| `distil-whisper/distil-large-v3.5`      | 1.46× Turbo, near-Large quality                                | No, English-only                                     | Whisper-compatible                                                              | Native                                     | Reject                  |
| `nvidia/parakeet-tdt-0.6b-v3`           | FastConformer/TDT, high throughput                             | No, 25 European languages                            | NeMo/Linux/NVIDIA runtime                                                       | Native                                     | Reject                  |
| `FunAudioLLM/SenseVoiceSmall`           | Claims 15× Whisper Large speed                                 | Not verified; official core list excludes Vietnamese | FunASR, not Transformers.js                                                     | No native segments                         | Reject                  |
| `UsefulSensors/moonshine-base`          | Fast, compact                                                  | No, English-only                                     | Transformers.js                                                                 | Native                                     | Reject                  |
| `facebook/mms-1b-all`                   | Broad language coverage                                        | Yes                                                  | Transformers.js-compatible                                                      | CTC only; quality/punctuation below target | Reject                  |

## Evidence

- Turbo ONNX: <https://huggingface.co/onnx-community/whisper-large-v3-turbo>
- Qwen3-ASR 0.6B: <https://huggingface.co/Qwen/Qwen3-ASR-0.6B>
- Qwen3-ASR HF: <https://huggingface.co/Qwen/Qwen3-ASR-0.6B-hf>
- Qwen3 community ONNX: <https://huggingface.co/Daumee/Qwen3-ASR-0.6B-ONNX-CPU>
- Distil-Whisper v3.5: <https://huggingface.co/distil-whisper/distil-large-v3.5>
- Parakeet TDT v3: <https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3>
- SenseVoiceSmall: <https://huggingface.co/FunAudioLLM/SenseVoiceSmall>
- Moonshine: <https://huggingface.co/UsefulSensors/moonshine-base>
- Transformers.js supported architectures: <https://github.com/huggingface/transformers.js#supported-tasksmodels>

## Why Qwen3-ASR Is Deferred

Qwen3-ASR-0.6B is the best future candidate: it explicitly supports Vietnamese and reports strong accuracy/speed. It is not a drop-in model:

1. It is an audio encoder + LLM decoder, not a Whisper architecture. The existing worker calls `pipeline("automatic-speech-recognition", ...)`; Transformers.js does not list Qwen3-ASR as a supported ASR architecture.
2. The available ONNX artifact is an unofficial custom CPU pipeline with encoder, decoder, tokenizer, and KV-cache orchestration. It requires direct `onnxruntime-web` integration, a new dependency/runtime configuration, Vite worker asset handling, custom cache logic, and a model-specific audio/decode loop.
3. Qwen3's streaming mode does not return timestamps. Qwen3-ForcedAligner-0.6B supports timestamps in 11 languages, excluding Vietnamese.
4. Chunk-offset cues are not acceptable substitutes: they would claim arbitrary 20–30-second transcript windows as timestamped segments and make misleading SRT/VTT exports.

## Plan

### Task 1 — Establish a valid Turbo benchmark

**Files:**

- Modify: `tests/e2e/real-transcription.spec.ts`
- Test: `tests/e2e/real-transcription.spec.ts`

Add a dedicated, gated `Whisper Large v3 Turbo` Vietnamese WebGPU test. The existing WebGPU test selects `Whisper Tiny`, so it cannot serve as a Turbo baseline.

The test must:

1. Select `Local WebGPU`.
2. Select `Whisper Large v3 Turbo` exactly.
3. Select Vietnamese.
4. Transcribe the existing Vietnamese fixture.
5. Assert the existing Vietnamese expected-content regex.
6. Emit/record audio duration, model-load time, transcription duration, and total wall time in an artifact or concise reporter output.

Run:

```bash
WHISDOM_REAL_ASR=1 WHISDOM_REAL_WEBGPU=1 pnpm exec playwright test tests/e2e/real-transcription.spec.ts --grep "Turbo" --reporter=list
```

Expected: passing Vietnamese transcript plus reproducible timing evidence. This measures the already-shipped optimized model; it does not add another runtime.

### Task 2 — Promote Turbo only if its benchmark supports the product claim

**Files:**

- Modify: `src/features/transcription/models.ts`
- Modify: `src/App.tsx`
- Modify: `tests/unit/models.test.ts`
- Modify: `tests/e2e/whisdom.spec.ts`

If Task 1 shows a usable WebGPU experience, update only model notes and bilingual UI copy to identify `Whisper Large v3 Turbo` as the recommended high-quality local model on capable hardware. Keep its existing identifier, cache behavior, dtype (`q4`), WebGPU requirement, timestamp behavior, and worker path unchanged.

Do not change the default model unless a separate product decision requests it: Turbo's download/memory cost remains materially higher than the current Base default.

### Task 3 — Reconsider Qwen3 only when all blockers close

Do not create an app integration spike until every item is true:

1. A maintained, pinned browser ONNX export exists with documented `onnxruntime-web` WebGPU/WASM support.
2. The export has a reproducible browser demo using the same Vietnamese fixture.
3. Vietnamese word or segment alignment is supported natively and can generate bounded, monotonic cues suitable for SRT/VTT.
4. Browser benchmark results beat the Turbo baseline from Task 1 without exceeding the project's practical memory/download budget.
5. The user explicitly approves a separate non-Whisper runtime and its ongoing model-export maintenance.

If those conditions become true, write a new implementation plan. It must add a dedicated worker and client boundary; it must not overload the current Whisper-only `sizeMb`-derived dtype/device rules.

## Validation

For Task 1 or Task 2:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Run the real Turbo benchmark separately because it downloads model assets and requires WebGPU hardware.

## Out of Scope

- Custom Qwen3 ONNX browser runtime.
- Approximate chunk-offset timestamps.
- Server-side Qwen3/vLLM integration.
- English-only optimized models.
- Removing the existing Whisper model catalog.

## Residual Risk

Turbo's real-world speed remains device-, browser-, model-cache-, and audio-length-dependent. Task 1 supplies the project-specific measurement before making a marketing or default-model claim.
