import type { LanguageCode, UiLanguage } from "./types"

export type WhisperLanguage = {
  code: string
  name: string
  nativeName: string
  whisperName: string
}

export const TRANSCRIPTION_LANGUAGES: WhisperLanguage[] = [
  { code: "af", name: "Afrikaans", nativeName: "Afrikaans", whisperName: "afrikaans" },
  { code: "am", name: "Amharic", nativeName: "አማርኛ", whisperName: "amharic" },
  { code: "ar", name: "Arabic", nativeName: "العربية", whisperName: "arabic" },
  { code: "as", name: "Assamese", nativeName: "অসমীয়া", whisperName: "assamese" },
  { code: "az", name: "Azerbaijani", nativeName: "Azərbaycanca", whisperName: "azerbaijani" },
  { code: "ba", name: "Bashkir", nativeName: "Башҡорт", whisperName: "bashkir" },
  { code: "be", name: "Belarusian", nativeName: "Беларуская", whisperName: "belarusian" },
  { code: "bg", name: "Bulgarian", nativeName: "Български", whisperName: "bulgarian" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", whisperName: "bengali" },
  { code: "bo", name: "Tibetan", nativeName: "བོད་སྐད", whisperName: "tibetan" },
  { code: "br", name: "Breton", nativeName: "Brezhoneg", whisperName: "breton" },
  { code: "bs", name: "Bosnian", nativeName: "Bosanski", whisperName: "bosnian" },
  { code: "ca", name: "Catalan", nativeName: "Català", whisperName: "catalan" },
  { code: "cs", name: "Czech", nativeName: "Čeština", whisperName: "czech" },
  { code: "cy", name: "Welsh", nativeName: "Cymraeg", whisperName: "welsh" },
  { code: "da", name: "Danish", nativeName: "Dansk", whisperName: "danish" },
  { code: "de", name: "German", nativeName: "Deutsch", whisperName: "german" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά", whisperName: "greek" },
  { code: "en", name: "English", nativeName: "English", whisperName: "english" },
  { code: "es", name: "Spanish", nativeName: "Español", whisperName: "spanish" },
  { code: "et", name: "Estonian", nativeName: "Eesti", whisperName: "estonian" },
  { code: "eu", name: "Basque", nativeName: "Euskara", whisperName: "basque" },
  { code: "fa", name: "Persian", nativeName: "فارسی", whisperName: "persian" },
  { code: "fi", name: "Finnish", nativeName: "Suomi", whisperName: "finnish" },
  { code: "fo", name: "Faroese", nativeName: "Føroyskt", whisperName: "faroese" },
  { code: "fr", name: "French", nativeName: "Français", whisperName: "french" },
  { code: "gl", name: "Galician", nativeName: "Galego", whisperName: "galician" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", whisperName: "gujarati" },
  { code: "ha", name: "Hausa", nativeName: "Hausa", whisperName: "hausa" },
  { code: "haw", name: "Hawaiian", nativeName: "ʻŌlelo Hawaiʻi", whisperName: "hawaiian" },
  { code: "he", name: "Hebrew", nativeName: "עברית", whisperName: "hebrew" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", whisperName: "hindi" },
  { code: "hr", name: "Croatian", nativeName: "Hrvatski", whisperName: "croatian" },
  { code: "ht", name: "Haitian Creole", nativeName: "Kreyòl ayisyen", whisperName: "haitian creole" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar", whisperName: "hungarian" },
  { code: "hy", name: "Armenian", nativeName: "Հայերեն", whisperName: "armenian" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", whisperName: "indonesian" },
  { code: "is", name: "Icelandic", nativeName: "Íslenska", whisperName: "icelandic" },
  { code: "it", name: "Italian", nativeName: "Italiano", whisperName: "italian" },
  { code: "ja", name: "Japanese", nativeName: "日本語", whisperName: "japanese" },
  { code: "jw", name: "Javanese", nativeName: "Basa Jawa", whisperName: "javanese" },
  { code: "ka", name: "Georgian", nativeName: "ქართული", whisperName: "georgian" },
  { code: "kk", name: "Kazakh", nativeName: "Қазақша", whisperName: "kazakh" },
  { code: "km", name: "Khmer", nativeName: "ខ្មែរ", whisperName: "khmer" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", whisperName: "kannada" },
  { code: "ko", name: "Korean", nativeName: "한국어", whisperName: "korean" },
  { code: "la", name: "Latin", nativeName: "Latina", whisperName: "latin" },
  { code: "lb", name: "Luxembourgish", nativeName: "Lëtzebuergesch", whisperName: "luxembourgish" },
  { code: "ln", name: "Lingala", nativeName: "Lingála", whisperName: "lingala" },
  { code: "lo", name: "Lao", nativeName: "ລາວ", whisperName: "lao" },
  { code: "lt", name: "Lithuanian", nativeName: "Lietuvių", whisperName: "lithuanian" },
  { code: "lv", name: "Latvian", nativeName: "Latviešu", whisperName: "latvian" },
  { code: "mg", name: "Malagasy", nativeName: "Malagasy", whisperName: "malagasy" },
  { code: "mi", name: "Maori", nativeName: "Māori", whisperName: "maori" },
  { code: "mk", name: "Macedonian", nativeName: "Македонски", whisperName: "macedonian" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", whisperName: "malayalam" },
  { code: "mn", name: "Mongolian", nativeName: "Монгол", whisperName: "mongolian" },
  { code: "mr", name: "Marathi", nativeName: "मराठी", whisperName: "marathi" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", whisperName: "malay" },
  { code: "mt", name: "Maltese", nativeName: "Malti", whisperName: "maltese" },
  { code: "my", name: "Myanmar", nativeName: "မြန်မာ", whisperName: "myanmar" },
  { code: "ne", name: "Nepali", nativeName: "नेपाली", whisperName: "nepali" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", whisperName: "dutch" },
  { code: "nn", name: "Norwegian Nynorsk", nativeName: "Norsk nynorsk", whisperName: "norwegian nynorsk" },
  { code: "no", name: "Norwegian", nativeName: "Norsk", whisperName: "norwegian" },
  { code: "oc", name: "Occitan", nativeName: "Occitan", whisperName: "occitan" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", whisperName: "punjabi" },
  { code: "pl", name: "Polish", nativeName: "Polski", whisperName: "polish" },
  { code: "ps", name: "Pashto", nativeName: "پښتو", whisperName: "pashto" },
  { code: "pt", name: "Portuguese", nativeName: "Português", whisperName: "portuguese" },
  { code: "ro", name: "Romanian", nativeName: "Română", whisperName: "romanian" },
  { code: "ru", name: "Russian", nativeName: "Русский", whisperName: "russian" },
  { code: "sa", name: "Sanskrit", nativeName: "संस्कृतम्", whisperName: "sanskrit" },
  { code: "sd", name: "Sindhi", nativeName: "سنڌي", whisperName: "sindhi" },
  { code: "si", name: "Sinhala", nativeName: "සිංහල", whisperName: "sinhala" },
  { code: "sk", name: "Slovak", nativeName: "Slovenčina", whisperName: "slovak" },
  { code: "sl", name: "Slovenian", nativeName: "Slovenščina", whisperName: "slovenian" },
  { code: "sn", name: "Shona", nativeName: "ChiShona", whisperName: "shona" },
  { code: "so", name: "Somali", nativeName: "Soomaali", whisperName: "somali" },
  { code: "sq", name: "Albanian", nativeName: "Shqip", whisperName: "albanian" },
  { code: "sr", name: "Serbian", nativeName: "Српски", whisperName: "serbian" },
  { code: "su", name: "Sundanese", nativeName: "Basa Sunda", whisperName: "sundanese" },
  { code: "sv", name: "Swedish", nativeName: "Svenska", whisperName: "swedish" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili", whisperName: "swahili" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", whisperName: "tamil" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", whisperName: "telugu" },
  { code: "tg", name: "Tajik", nativeName: "Тоҷикӣ", whisperName: "tajik" },
  { code: "th", name: "Thai", nativeName: "ไทย", whisperName: "thai" },
  { code: "tk", name: "Turkmen", nativeName: "Türkmen", whisperName: "turkmen" },
  { code: "tl", name: "Tagalog", nativeName: "Tagalog", whisperName: "tagalog" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", whisperName: "turkish" },
  { code: "tt", name: "Tatar", nativeName: "Татар", whisperName: "tatar" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", whisperName: "ukrainian" },
  { code: "ur", name: "Urdu", nativeName: "اردو", whisperName: "urdu" },
  { code: "uz", name: "Uzbek", nativeName: "Oʻzbek", whisperName: "uzbek" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", whisperName: "vietnamese" },
  { code: "yi", name: "Yiddish", nativeName: "ייִדיש", whisperName: "yiddish" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá", whisperName: "yoruba" },
  { code: "yue", name: "Cantonese", nativeName: "粵語", whisperName: "cantonese" },
  { code: "zh", name: "Chinese", nativeName: "中文", whisperName: "chinese" },
]

export function resolveTranscriptionLanguage(language: LanguageCode, uiLanguage: UiLanguage) {
  return language === "auto" ? uiLanguage : language
}

export function toWhisperLanguageName(language: Exclude<LanguageCode, "auto">) {
  return TRANSCRIPTION_LANGUAGES.find((item) => item.code === language)?.whisperName ?? language
}

export function getLanguageLabel(language: LanguageCode, autoLabel = "Auto") {
  if (language === "auto") {
    return autoLabel
  }

  const match = TRANSCRIPTION_LANGUAGES.find((item) => item.code === language)

  if (!match) {
    return language.toUpperCase()
  }

  return match.name === match.nativeName ? match.name : `${match.name} / ${match.nativeName}`
}

export function isEnglishOnlyLanguageMismatch(language: LanguageCode, uiLanguage: UiLanguage) {
  return resolveTranscriptionLanguage(language, uiLanguage) !== "en"
}
