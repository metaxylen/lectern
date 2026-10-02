import { parseWhisperInference, type WhisperInference } from "./parse";
import { ensureWhisperServer, scheduleWhisperIdleShutdown } from "./server";

export async function warmupWhisper(): Promise<{
  ok: true;
  backend: "metal" | "cpu";
  model: string;
}> {
  await ensureWhisperServer();
  return {
    ok: true,
    backend: process.platform === "darwin" ? "metal" : "cpu",
    model: "large-v3-turbo",
  };
}

export async function transcribeWavBytes(
  wav: Uint8Array,
  language: string,
): Promise<WhisperInference> {
  const url = await ensureWhisperServer();
  const copy = Buffer.from(wav);
  const form = new FormData();
  form.append("file", new Blob([copy], { type: "audio/wav" }), "audio.wav");
  form.append("temperature", "0.0");
  form.append("temperature_inc", "0.0");
  form.append("response_format", "verbose_json");
  form.append("language", language && language !== "auto" ? language : "auto");

  const res = await fetch(`${url}/inference`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err =
      json && typeof json === "object" && "error" in json && typeof json.error === "string"
        ? json.error
        : `whisper-server HTTP ${res.status}`;
    throw new Error(err);
  }
  const result = parseWhisperInference(json);
  scheduleWhisperIdleShutdown();
  return result;
}
