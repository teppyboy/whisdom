import {
  clearTranscripts,
  deleteTranscript,
  listTranscripts,
  loadSettings,
  renameTranscript,
  saveSettings,
  saveTranscript,
} from "@/features/storage/indexed-db"

export interface StorageCompatibilityApi {
  loadSettings: typeof loadSettings
  saveSettings: typeof saveSettings
  saveTranscript: typeof saveTranscript
  deleteTranscript: typeof deleteTranscript
  clearTranscripts: typeof clearTranscripts
  renameTranscript: typeof renameTranscript
  listTranscripts: typeof listTranscripts
}

declare global {
  interface Window {
    __WHISDOM_STORAGE_COMPATIBILITY__: StorageCompatibilityApi
  }
}

export const STORAGE_COMPATIBILITY_API: StorageCompatibilityApi = Object.freeze({
  loadSettings,
  saveSettings,
  saveTranscript,
  deleteTranscript,
  clearTranscripts,
  renameTranscript,
  listTranscripts,
})

window.__WHISDOM_STORAGE_COMPATIBILITY__ = STORAGE_COMPATIBILITY_API
