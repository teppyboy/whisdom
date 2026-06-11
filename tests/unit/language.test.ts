import { describe, expect, it } from "vitest"

import {
  getLanguageLabel,
  isEnglishOnlyLanguageMismatch,
  resolveTranscriptionLanguage,
  toWhisperLanguageName,
  TRANSCRIPTION_LANGUAGES,
} from "@/features/transcription/language"

describe("transcription language helpers", () => {
  it("resolves auto to the current interface language", () => {
    expect(resolveTranscriptionLanguage("auto", "en")).toBe("en")
    expect(resolveTranscriptionLanguage("auto", "vi")).toBe("vi")
  })

  it("keeps explicit transcription language selections", () => {
    expect(resolveTranscriptionLanguage("vi", "en")).toBe("vi")
    expect(resolveTranscriptionLanguage("en", "vi")).toBe("en")
    expect(resolveTranscriptionLanguage("fr", "vi")).toBe("fr")
  })

  it("maps app language codes to Whisper language names", () => {
    expect(toWhisperLanguageName("en")).toBe("english")
    expect(toWhisperLanguageName("vi")).toBe("vietnamese")
    expect(toWhisperLanguageName("fr")).toBe("french")
    expect(toWhisperLanguageName("ko")).toBe("korean")
  })

  it("includes a broad searchable Whisper language catalog", () => {
    expect(TRANSCRIPTION_LANGUAGES.length).toBeGreaterThan(80)
    expect(getLanguageLabel("ja")).toContain("Japanese")
    expect(getLanguageLabel("auto", "Automatic")).toBe("Automatic")
  })

  it("detects English-only model mismatches for any non-English language", () => {
    expect(isEnglishOnlyLanguageMismatch("en", "vi")).toBe(false)
    expect(isEnglishOnlyLanguageMismatch("auto", "en")).toBe(false)
    expect(isEnglishOnlyLanguageMismatch("auto", "vi")).toBe(true)
    expect(isEnglishOnlyLanguageMismatch("fr", "en")).toBe(true)
  })
})
