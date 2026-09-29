import { z } from "zod";

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
