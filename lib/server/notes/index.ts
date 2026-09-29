import { extractiveNotes } from "../../extractive";
import type { EngineStatus, NotesEngine, NotesEngineChoice, NotesResult } from "../../types";
import { getEnv } from "../env";
import { geminiNotes } from "./gemini";
import { listOllamaModels, ollamaNotes, pickOllamaModel } from "./ollama";

export async function getEngineStatus(): Promise<EngineStatus> {
  const env = getEnv();
  const models = await listOllamaModels();
  return {
    ollama: {
      reachable: models !== null,
      host: env.OLLAMA_HOST,
      models: models ?? [],
      selected: models ? pickOllamaModel(models) : null,
    },
    gemini: { configured: !!env.GEMINI_API_KEY, model: env.GEMINI_MODEL },
  };
}

export async function generateNotes(
  transcript: string,
  language: string,
  choice: NotesEngineChoice,
  glossary = false,
): Promise<NotesResult> {
  const order: NotesEngine[] = choice === "auto" ? ["ollama", "gemini", "offline"] : [choice];
  const fallbackReasons: string[] = [];

  for (const engine of order) {
    try {
      if (engine === "ollama") {
        return { ...(await ollamaNotes(transcript, language, glossary)), engine, fallbackReasons };
      }
      if (engine === "gemini") {
        return { ...(await geminiNotes(transcript, language, glossary)), engine, fallbackReasons };
      }
      return { notes: extractiveNotes(transcript), engine: "offline", fallbackReasons };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (choice !== "auto") throw new Error(msg);
      fallbackReasons.push(`${engine}: ${msg}`);
    }
  }
  return { notes: extractiveNotes(transcript), engine: "offline", fallbackReasons };
}
