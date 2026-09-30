import { offlineNotes } from "../../notes/offline";
import type { EngineStatus, NotesEngine, NotesEngineChoice, NotesResult } from "../../types";
import { getEnv } from "../env";
import {
  createGeminiClient,
  createOllamaClient,
  listOllamaModels,
  pickOllamaModel,
  type LlmClient,
} from "./llm";
import {
  prepareTranscript,
  runLlmPipeline,
  type NotesInput,
  type PipelineOptions,
} from "./pipeline";

export type { NotesInput, ProgressEvent } from "./pipeline";

export async function getEngineStatus(): Promise<EngineStatus> {
  const env = getEnv();
  const models = await listOllamaModels();
  return {
    ollama: {
      reachable: models !== null,
      host: env.OLLAMA_HOST,
      models: (models ?? []).map((m) => m.name),
      selected: models ? pickOllamaModel(models) : null,
    },
    gemini: { configured: !!env.GEMINI_API_KEY, model: env.GEMINI_MODEL },
  };
}

const CLIENTS: Record<Exclude<NotesEngine, "offline">, () => Promise<LlmClient>> = {
  ollama: createOllamaClient,
  gemini: createGeminiClient,
};

/**
 * Generate notes. With `auto` the engines are tried in order (local Ollama, Gemini, offline) and
 * the reasons for skipping any are reported; a forced engine fails loudly instead of degrading.
 */
export async function generateNotes(
  input: NotesInput,
  choice: NotesEngineChoice,
  opts: PipelineOptions & {
    /** Test seam: supply clients instead of talking to real engines. */
    clients?: Partial<Record<Exclude<NotesEngine, "offline">, () => Promise<LlmClient>>>;
  } = {},
): Promise<NotesResult> {
  const order: NotesEngine[] = choice === "auto" ? ["ollama", "gemini", "offline"] : [choice];
  const fallbackReasons: string[] = [];
  const started = Date.now();
  const factories = { ...CLIENTS, ...opts.clients };

  for (const engine of order) {
    if (opts.signal?.aborted) throw new Error("Cancelled");
    try {
      if (engine === "offline") {
        const { segments, plain } = prepareTranscript(input);
        return {
          notes: offlineNotes(plain, segments),
          engine: "offline",
          fallbackReasons,
          warnings: [],
          elapsedMs: Date.now() - started,
        };
      }
      opts.onProgress?.({ message: `Connecting to ${engine === "ollama" ? "Ollama" : "Gemini"}` });
      const client = await factories[engine]();
      const result = await runLlmPipeline(client, input, opts);
      return {
        notes: result.notes,
        engine,
        model: client.model,
        fallbackReasons,
        warnings: result.warnings,
        elapsedMs: Date.now() - started,
      };
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (choice !== "auto") throw new Error(msg);
      fallbackReasons.push(`${engine}: ${msg}`);
    }
  }
  // Unreachable in practice (offline never throws), but keep the contract total.
  const { segments, plain } = prepareTranscript(input);
  return {
    notes: offlineNotes(plain, segments),
    engine: "offline",
    fallbackReasons,
    warnings: [],
    elapsedMs: Date.now() - started,
  };
}
