import type { AppSettings, WhisperModel } from "./types"

export type LocalModelDtype = "fp32" | "q4"

export const FULL_PRECISION_BROWSER_MODEL_LIMIT_MB = 1000

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
    id: "onnx-community/whisper-medium_timestamped",
    label: "Whisper Medium Timestamped",
    sizeMb: 1450,
    quality: "high",
    multilingual: true,
    notes: "High-accuracy multilingual model with timestamp-focused weights for high-end devices.",
  },
  {
    id: "onnx-community/whisper-large-v3-turbo",
    label: "Whisper Large v3 Turbo",
    sizeMb: 1600,
    quality: "high",
    multilingual: true,
    notes: "Best high-end default: much higher accuracy than Small while staying faster than full Large v3.",
  },
  {
    id: "onnx-community/whisper-large-v3-ONNX",
    label: "Whisper Large v3",
    sizeMb: 3100,
    quality: "high",
    multilingual: true,
    notes: "Maximum accuracy option. Very large download and long initialization; intended for high-end devices.",
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
  serverModelId: null,
}

export function findModel(modelId: string) {
  return WHISPER_MODELS.find((model) => model.id === modelId) ?? WHISPER_MODELS[0]
}

export function getLocalModelDtype(model: WhisperModel): LocalModelDtype {
  return model.sizeMb > FULL_PRECISION_BROWSER_MODEL_LIMIT_MB ? "q4" : "fp32"
}

export function requiresWebGpuForLocalModel(model: WhisperModel) {
  return getLocalModelDtype(model) === "q4"
}

export function canRunModelLocally(model: WhisperModel, device: "webgpu" | "wasm") {
  return !requiresWebGpuForLocalModel(model) || device === "webgpu"
}
