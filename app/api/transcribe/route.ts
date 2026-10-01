import { NextResponse } from "next/server";
import { reportError } from "@/lib/monitoring";
import { apiError } from "@/lib/server/api";
import { getEnv } from "@/lib/server/env";
import { clientKey, createRateLimiter, type RateLimiter } from "@/lib/server/rate-limit";
import { WhisperUnavailableError } from "@/lib/server/stt/server";
import { transcribeWavBytes, warmupWhisper } from "@/lib/server/stt/transcribe";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

let limiter: RateLimiter | null = null;
function getLimiter() {
  limiter ??= createRateLimiter({
    limit: getEnv().STT_RATE_LIMIT_PER_MINUTE,
    windowMs: 60_000,
  });
  return limiter;
}

function fail(err: unknown) {
  const unavailable =
    err instanceof WhisperUnavailableError ||
    (err instanceof Error && err.name === "WhisperUnavailableError");
  if (unavailable) {
    return apiError(
      503,
      "engine_unavailable",
      err instanceof Error ? err.message : "Whisper is not installed",
    );
  }
  reportError(err, { route: "/api/transcribe" });
  return apiError(
    502,
    "engine_failed",
    err instanceof Error ? err.message : "Transcription failed",
  );
}

export async function POST(request: Request) {
  let env;
  try {
    env = getEnv();
  } catch (err) {
    reportError(err, { route: "/api/transcribe" });
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

  if (request.headers.get("x-warmup") === "1") {
    try {
      return NextResponse.json(await warmupWhisper(), { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      return fail(err);
    }
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > env.STT_MAX_AUDIO_BYTES) {
    return apiError(413, "payload_too_large", "Audio is too large to transcribe in one request.");
  }

  const language = (request.headers.get("x-speech-language") ?? "auto").trim() || "auto";
  if (!/^(auto|[a-z]{2}(-[a-z]{2})?)$/i.test(language)) {
    return apiError(400, "invalid_request", "Invalid language");
  }

  let wav: Uint8Array;
  try {
    wav = new Uint8Array(await request.arrayBuffer());
  } catch {
    return apiError(400, "invalid_request", "Could not read audio body");
  }
  if (wav.byteLength < 44) {
    return apiError(400, "invalid_request", "Audio body is empty");
  }
  if (wav.byteLength > env.STT_MAX_AUDIO_BYTES) {
    return apiError(413, "payload_too_large", "Audio is too large to transcribe in one request.");
  }

  try {
    const result = await transcribeWavBytes(wav, language.toLowerCase());
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
}
