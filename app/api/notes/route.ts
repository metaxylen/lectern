import { NextResponse } from "next/server";
import { z } from "zod";
import { LANGUAGES } from "@/lib/languages";
import { reportError } from "@/lib/monitoring";
import { apiError } from "@/lib/server/api";
import { getEnv } from "@/lib/server/env";
import { generateNotes } from "@/lib/server/notes";
import { clientKey, createRateLimiter, type RateLimiter } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [string, ...string[]];

const BodySchema = z.object({
  transcript: z.string().trim().min(1, "Transcript is empty"),
  language: z.enum(LANGUAGE_CODES).default("en"),
  glossary: z.boolean().default(false),
  engine: z.enum(["auto", "ollama", "gemini", "offline"]).default("auto"),
});

let limiter: RateLimiter | null = null;
function getLimiter() {
  limiter ??= createRateLimiter({
    limit: getEnv().NOTES_RATE_LIMIT_PER_MINUTE,
    windowMs: 60_000,
  });
  return limiter;
}

export async function POST(request: Request) {
  let env;
  try {
    env = getEnv();
  } catch (err) {
    reportError(err, { route: "/api/notes" });
    return apiError(
      500,
      "misconfigured",
      "The server is misconfigured. Check its environment variables.",
    );
  }

  const rate = getLimiter().check(clientKey(request.headers));
  if (!rate.ok) {
    return apiError(429, "rate_limited", "Too many requests. Please wait a moment and try again.", {
      "Retry-After": String(rate.retryAfterSec),
    });
  }

  // JSON overhead and multi-byte characters mean bytes can exceed chars; allow generous headroom.
  const maxBytes = env.NOTES_MAX_TRANSCRIPT_CHARS * 4 + 1024;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return apiError(413, "payload_too_large", "The transcript is too long to process.");
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Invalid JSON body");
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return apiError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const { transcript, language, glossary, engine } = parsed.data;
  if (transcript.length > env.NOTES_MAX_TRANSCRIPT_CHARS) {
    return apiError(
      413,
      "payload_too_large",
      `The transcript is too long (limit ${env.NOTES_MAX_TRANSCRIPT_CHARS.toLocaleString("en-US")} characters).`,
    );
  }

  try {
    const result = await generateNotes(transcript, language, engine, glossary);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    reportError(err, { route: "/api/notes", engine });
    return apiError(
      502,
      "engine_failed",
      err instanceof Error ? err.message : "Notes generation failed",
    );
  }
}
