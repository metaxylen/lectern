export type Language = { code: string; label: string; english: string };

export const LANGUAGES: Language[] = [
  { code: "tr", label: "Türkçe", english: "Turkish" },
  { code: "en", label: "English", english: "English" },
  { code: "de", label: "Deutsch", english: "German" },
  { code: "fr", label: "Français", english: "French" },
  { code: "es", label: "Español", english: "Spanish" },
  { code: "ar", label: "العربية", english: "Arabic" },
  { code: "ru", label: "Русский", english: "Russian" },
];

export const DEFAULT_LANGUAGE = "en";

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.english ?? "Turkish";
}

export type Option = { value: string; label: string };

const OTHERS = LANGUAGES.filter((l) => l.code !== "en" && l.code !== "tr");

export const SPEECH_OPTIONS: Option[] = [
  { value: "auto", label: "Auto-detect (English + Turkish)" },
  { value: "en", label: "English (primary)" },
  { value: "tr", label: "Türkçe" },
  ...OTHERS.map((l) => ({ value: l.code, label: l.label })),
];

export const DEFAULT_SPEECH_LANGUAGE = "auto";

export const NOTES_OPTIONS: Option[] = [
  { value: "en-glossary", label: "English + Turkish glossary" },
  { value: "en", label: "English" },
  { value: "tr", label: "Türkçe" },
  ...OTHERS.map((l) => ({ value: l.code, label: l.label })),
];

export const DEFAULT_NOTES_LANGUAGE = "en-glossary";

export function parseNotesLanguage(value: string): { language: string; glossary: boolean } {
  return value === "en-glossary"
    ? { language: "en", glossary: true }
    : { language: value, glossary: false };
}
