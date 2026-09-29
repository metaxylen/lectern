import { condenseTranscript } from "../../extractive";
import type { Notes } from "../../types";
import { getEnv } from "../env";
import { normalizeNotes, parseJson } from "./normalize";
import { buildPrompt } from "./prompt";

const MAX_CHARS = 14_000;
const PREFERRED_MODELS = ["qwen2.5", "qwen3", "llama3", "gemma", "mistral", "phi"];

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

export function pickOllamaModel(models: string[], forced = getEnv().OLLAMA_MODEL): string | null {
  if (forced) return forced;
  for (const p of PREFERRED_MODELS) {
    const hit = models.find((m) => m.toLowerCase().startsWith(p));
    if (hit) return hit;
  }
  return models[0] ?? null;
}

export async function ollamaNotes(
  transcript: string,
  language: string,
  glossary: boolean,
): Promise<{ notes: Notes; model: string }> {
  const { OLLAMA_HOST } = getEnv();
  const models = await listOllamaModels();
  if (!models) throw new Error(`Ollama not reachable at ${OLLAMA_HOST}`);
  const model = pickOllamaModel(models);
  if (!model) throw new Error("Ollama is running but has no models (try: ollama pull qwen2.5:7b)");
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(600_000),
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: { temperature: 0.2, num_ctx: 8192 },
      messages: [
        {
          role: "user",
          content: buildPrompt(condenseTranscript(transcript, MAX_CHARS), language, glossary),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return { notes: normalizeNotes(parseJson(data.message?.content ?? "")), model };
}
