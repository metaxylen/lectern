import { condenseTranscript } from "../../extractive";
import type { Notes } from "../../types";
import { getEnv } from "../env";
import { normalizeNotes, parseJson } from "./normalize";
import { buildPrompt } from "./prompt";

const MAX_CHARS = 300_000;

export async function geminiNotes(
  transcript: string,
  language: string,
  glossary: boolean,
): Promise<{ notes: Notes; model: string }> {
  const { GEMINI_API_KEY, GEMINI_MODEL } = getEnv();
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: buildPrompt(condenseTranscript(transcript, MAX_CHARS), language, glossary) },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return { notes: normalizeNotes(parseJson(text)), model: GEMINI_MODEL };
}
