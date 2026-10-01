import { z } from "zod";
import { DEFAULT_WHISPER_PORT, defaultWhisperBinPath, defaultWhisperModelPath } from "./stt/paths";

/** Treat `FOO=` (empty) the same as unset so defaults apply. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema);

const EnvSchema = z.object({
  OLLAMA_HOST: optional(z.url().default("http://127.0.0.1:11434")).transform((v) =>
    v.replace(/\/+$/, ""),
  ),
  OLLAMA_MODEL: optional(z.string().trim().default("")),
  GEMINI_API_KEY: optional(z.string().trim().default("")),
  GEMINI_MODEL: optional(z.string().trim().default("gemini-flash-latest")),
  /** Hard cap on transcript size accepted by /api/notes. */
  NOTES_MAX_TRANSCRIPT_CHARS: optional(z.coerce.number().int().positive().default(500_000)),
  /** Requests per minute per client for /api/notes. 0 disables rate limiting. */
  NOTES_RATE_LIMIT_PER_MINUTE: optional(z.coerce.number().int().min(0).default(20)),
  /** whisper.cpp weights (ggml-large-v3-turbo.bin). */
  WHISPER_MODEL_PATH: optional(z.string().trim().default("")).transform(
    (v) => v || defaultWhisperModelPath(),
  ),
  /** Path to the whisper-server binary. */
  WHISPER_SERVER_BIN: optional(z.string().trim().default("")).transform(
    (v) => v || defaultWhisperBinPath(),
  ),
  /** If set, use this already-running server instead of spawning one. */
  WHISPER_SERVER_URL: optional(
    z
      .string()
      .trim()
      .default("")
      .refine((v) => v === "" || URL.canParse(v), { message: "Invalid url" })
      .transform((v) => v.replace(/\/+$/, "")),
  ),
  WHISPER_PORT: optional(z.coerce.number().int().min(1).max(65535).default(DEFAULT_WHISPER_PORT)),
  /** Largest WAV accepted by /api/transcribe (one 20 s part is ~640 KB). */
  STT_MAX_AUDIO_BYTES: optional(z.coerce.number().int().positive().default(8_000_000)),
  /** Requests per minute per client for /api/transcribe. 0 disables. Live ticks need headroom. */
  STT_RATE_LIMIT_PER_MINUTE: optional(z.coerce.number().int().min(0).default(90)),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}

let cached: ServerEnv | null = null;

/** Validated server environment, parsed once on first use (never at build time). */
export function getEnv(): ServerEnv {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Test helper: drop the cached parse so the next getEnv() re-reads process.env. */
export function resetEnvCache() {
  cached = null;
}
