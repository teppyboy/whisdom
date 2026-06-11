import { describe, expect, it } from "vitest"

import { DEFAULT_SETTINGS, findModel, WHISPER_MODELS } from "@/features/transcription/models"

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
})
