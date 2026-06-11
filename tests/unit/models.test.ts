import { describe, expect, it } from "vitest"

import {
  DEFAULT_SETTINGS,
  findModel,
  getLocalModelDtype,
  requiresWebGpuForLocalModel,
  WHISPER_MODELS,
} from "@/features/transcription/models"

describe("Whisper model catalog", () => {
  it("defaults to multilingual Whisper Base", () => {
    const defaultModel = findModel(DEFAULT_SETTINGS.modelId)

    expect(defaultModel.id).toBe("onnx-community/whisper-base")
    expect(defaultModel.multilingual).toBe(true)
  })

  it("falls back to the default model for unknown IDs", () => {
    expect(findModel("missing-model")).toBe(WHISPER_MODELS[0])
  })

  it("keeps English-only model explicitly marked", () => {
    expect(findModel("onnx-community/whisper-tiny.en").multilingual).toBe(false)
  })

  it("includes high-accuracy models for high-end devices", () => {
    expect(findModel("onnx-community/whisper-medium_timestamped").multilingual).toBe(true)
    expect(findModel("onnx-community/whisper-large-v3-turbo").sizeMb).toBeGreaterThan(1000)
    expect(findModel("onnx-community/whisper-large-v3-ONNX").label).toBe("Whisper Large v3")
  })

  it("uses quantized browser weights for large local models", () => {
    expect(getLocalModelDtype(findModel("onnx-community/whisper-small"))).toBe("fp32")
    expect(getLocalModelDtype(findModel("onnx-community/whisper-large-v3-turbo"))).toBe("q4")
    expect(getLocalModelDtype(findModel("onnx-community/whisper-large-v3-ONNX"))).toBe("q4")
    expect(requiresWebGpuForLocalModel(findModel("onnx-community/whisper-large-v3-ONNX"))).toBe(true)
  })
})
