import type { NotesEngine } from "../../types";
import { getEnv } from "../env";

/** A language model we can ask for JSON. Implementations hide engine-specific HTTP details. */
export type LlmClient = {
  engine: Exclude<NotesEngine, "offline">;
  model: string;
  /** Largest transcript (characters) to send in a single pass. */
  singlePassChars: number;
  /** Target size of each part when a long lecture is summarized part by part. */
  sectionChars: number;
  /** Ask for one JSON object; returns the raw text. `schema` constrains decoding when supported. */
  generateJson: (
    prompt: string,
    opts?: { schema?: Record<string, unknown>; signal?: AbortSignal },
  ) => Promise<string>;
};

const PREFERRED_MODELS = ["qwen2.5", "qwen3", "gemma3", "llama3", "mistral", "phi"];

export async function listOllamaModels(): Promise<string[] | null> {
  try {
    const res = await fetch(`${getEnv().OLLAMA_HOST}/api/tags`, {
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name).filter((n) => !/embed/i.test(n));
  } catch {
    return null;
  }
}

/** Prefer a forced model, then known-good families; within a family prefer the larger model. */
export function pickOllamaModel(models: string[], forced = getEnv().OLLAMA_MODEL): string | null {
  if (forced) return forced;
  const size = (name: string) => Number(name.match(/(\d+(?:\.\d+)?)b\b/i)?.[1] ?? 0);
  for (const family of PREFERRED_MODELS) {
    const hits = models.filter((m) => m.toLowerCase().startsWith(family));
    if (hits.length) return hits.sort((a, b) => size(b) - size(a))[0];
  }
  return models[0] ?? null;
}

export async function createOllamaClient(): Promise<LlmClient> {
  const { OLLAMA_HOST } = getEnv();
  const models = await listOllamaModels();
  if (!models) throw new Error(`Ollama not reachable at ${OLLAMA_HOST}`);
  const model = pickOllamaModel(models);
  if (!model) throw new Error("Ollama is running but has no models (try: ollama pull qwen2.5:7b)");

  return {
    engine: "ollama",
    model,
    // num_ctx below is 16k tokens; Turkish averages ~2.5 characters per token, so stay well inside.
    singlePassChars: 16_000,
    sectionChars: 12_000,
    async generateJson(prompt, opts) {
      const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: anySignal(AbortSignal.timeout(600_000), opts?.signal),
        body: JSON.stringify({
          model,
          stream: false,
          format: opts?.schema ?? "json",
          keep_alive: "15m",
          // A fixed seed keeps results reproducible for the same input (and makes evals comparable).
          options: { temperature: 0.2, num_ctx: 16_384, num_predict: 4096, seed: 42 },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok)
        throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { message?: { content?: string } };
      return data.message?.content ?? "";
    },
  };
}

export async function createGeminiClient(): Promise<LlmClient> {
  const { GEMINI_API_KEY, GEMINI_MODEL } = getEnv();
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  return {
    engine: "gemini",
    model: GEMINI_MODEL,
    singlePassChars: 300_000,
    sectionChars: 150_000,
    async generateJson(prompt, opts) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
          signal: anySignal(AbortSignal.timeout(180_000), opts?.signal),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
          }),
        },
      );
      if (!res.ok)
        throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    },
  };
}

/** Abort when any of the given signals aborts (AbortSignal.any with a fallback for older runtimes). */
export function anySignal(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const real = signals.filter((s): s is AbortSignal => !!s);
  if (real.length === 1) return real[0];
  return AbortSignal.any(real);
}
