import type { AppSettings, WhisperModel } from "./types"

export const WHISPER_MODELS: WhisperModel[] = [
  {
    id: "onnx-community/whisper-base",
    label: "Whisper Base",
    sizeMb: 145,
    quality: "balanced",
    multilingual: true,
    notes: "Default. Good English/Vietnamese balance for local browsers.",
  },
  {
    id: "onnx-community/whisper-tiny",
    label: "Whisper Tiny",
    sizeMb: 75,
    quality: "fast",
    multilingual: true,
    notes: "Fastest multilingual local option. Lower accuracy.",
  },
  {
    id: "onnx-community/whisper-small",
    label: "Whisper Small",
    sizeMb: 466,
    quality: "high",
    multilingual: true,
    notes: "Better accuracy, heavier download and memory use.",
  },
  {
    id: "onnx-community/whisper-tiny.en",
    label: "Whisper Tiny English",
    sizeMb: 75,
    quality: "fast",
    multilingual: false,
    notes: "English-only. Not suitable for Vietnamese.",
  },
]

export const DEFAULT_SETTINGS: AppSettings = {
  uiLanguage: "en",
  modelId: "onnx-community/whisper-base",
  language: "auto",
  mode: "local-webgpu",
  chunkSeconds: 30,
  overlapSeconds: 1,
  persistMediaBlobs: false,
}

export function findModel(modelId: string) {
  return WHISPER_MODELS.find((model) => model.id === modelId) ?? WHISPER_MODELS[0]
}
