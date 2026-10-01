import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/server/env";

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

const wav = new Uint8Array(44).fill(1);

const post = (opts: { body?: BodyInit | null; headers?: Record<string, string> } = {}) =>
  new Request("http://test/api/transcribe", {
    method: "POST",
    headers: opts.headers,
    body: opts.body ?? wav,
  });

beforeEach(() => {
  vi.stubEnv("STT_RATE_LIMIT_PER_MINUTE", "3");
  vi.stubEnv("STT_MAX_AUDIO_BYTES", "1000");
  resetEnvCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
  vi.doUnmock("@/lib/server/stt/transcribe");
});

describe("POST /api/transcribe", () => {
  it("warms up the engine", async () => {
    vi.doMock("@/lib/server/stt/transcribe", () => ({
      warmupWhisper: vi.fn(async () => ({ ok: true, backend: "metal", model: "large-v3-turbo" })),
      transcribeWavBytes: vi.fn(),
    }));
    const { POST } = await loadRoute();
    const res = await POST(post({ headers: { "x-warmup": "1" }, body: null }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, backend: "metal", model: "large-v3-turbo" });
  });

  it("transcribes a WAV body", async () => {
    vi.doMock("@/lib/server/stt/transcribe", () => ({
      warmupWhisper: vi.fn(),
      transcribeWavBytes: vi.fn(async () => ({ text: "hello", language: "en" })),
    }));
    const { POST } = await loadRoute();
    const res = await POST(post({ headers: { "x-speech-language": "en" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "hello", language: "en" });
  });

  it("rejects an empty body", async () => {
    vi.doMock("@/lib/server/stt/transcribe", () => ({
      warmupWhisper: vi.fn(),
      transcribeWavBytes: vi.fn(),
    }));
    const { POST } = await loadRoute();
    const res = await POST(post({ body: new Uint8Array(8) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_request" });
  });

  it("rejects a bad language tag", async () => {
    vi.doMock("@/lib/server/stt/transcribe", () => ({
      warmupWhisper: vi.fn(),
      transcribeWavBytes: vi.fn(),
    }));
    const { POST } = await loadRoute();
    const res = await POST(post({ headers: { "x-speech-language": "klingon" } }));
    expect(res.status).toBe(400);
  });

  it("rejects an oversized declared content-length", async () => {
    vi.doMock("@/lib/server/stt/transcribe", () => ({
      warmupWhisper: vi.fn(),
      transcribeWavBytes: vi.fn(),
    }));
    const { POST } = await loadRoute();
    const res = await POST(post({ headers: { "content-length": "999999" } }));
    expect(res.status).toBe(413);
  });

  it("maps a missing engine to 503", async () => {
    const { WhisperUnavailableError } = await import("@/lib/server/stt/server");
    vi.doMock("@/lib/server/stt/transcribe", () => ({
      warmupWhisper: vi.fn(async () => {
        throw new WhisperUnavailableError("not installed");
      }),
      transcribeWavBytes: vi.fn(),
    }));
    const { POST } = await loadRoute();
    const res = await POST(post({ headers: { "x-warmup": "1" }, body: null }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "engine_unavailable", error: "not installed" });
  });
});
