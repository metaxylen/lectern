const LANGUAGE_NAMES: Record<string, string> = {
  english: "en",
  turkish: "tr",
  german: "de",
  french: "fr",
  spanish: "es",
  italian: "it",
  dutch: "nl",
  portuguese: "pt",
  russian: "ru",
  arabic: "ar",
  chinese: "zh",
  japanese: "ja",
  korean: "ko",
};

export type WhisperInference = { text: string; language?: string };

function asLanguage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim().toLowerCase();
  if (!raw || raw === "auto") return undefined;
  if (/^[a-z]{2}(-[a-z]{2})?$/.test(raw)) return raw.slice(0, 2);
  return LANGUAGE_NAMES[raw];
}

/** Normalise whisper-server JSON (`json` or `verbose_json`) into the client result shape. */
export function parseWhisperInference(json: unknown): WhisperInference {
  if (!json || typeof json !== "object") throw new Error("Whisper returned an empty response.");
  const body = json as Record<string, unknown>;
  if (typeof body.error === "string" && body.error.trim()) throw new Error(body.error);
  const text = String(body.text ?? "").trim();
  const language = asLanguage(body.language);
  return language ? { text, language } : { text };
}
