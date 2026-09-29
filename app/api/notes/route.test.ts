import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/server/env";

const TRANSCRIPT =
  "A thread is a unit of execution. Threads share memory. This is important for the exam.";

// Load a fresh module per test so the module-level rate limiter starts empty.
async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://test/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("NOTES_RATE_LIMIT_PER_MINUTE", "3");
  vi.stubEnv("NOTES_MAX_TRANSCRIPT_CHARS", "500");
  resetEnvCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("POST /api/notes", () => {
  it("returns offline notes for a valid request", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ transcript: TRANSCRIPT, engine: "offline" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.engine).toBe("offline");
    expect(body.notes.title).toBeTruthy();
  });

  it("rejects malformed JSON", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post("{nope"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_json" });
  });

  it.each([
    [{}],
    [{ transcript: "   " }],
    [{ transcript: "x", language: "klingon" }],
    [{ transcript: "x", engine: "gpt" }],
    [{ transcript: "x", glossary: "yes" }],
    [{ transcript: 42 }],
  ])("rejects invalid body %j", async (body) => {
    const { POST } = await loadRoute();
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_request" });
  });

  it("rejects oversized transcripts with 413", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ transcript: "a".repeat(501), engine: "offline" }));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "payload_too_large" });
  });

  it("rejects an oversized declared content-length before parsing", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ transcript: "x" }, { "content-length": "999999999" }));
    expect(res.status).toBe(413);
  });

  it("rate limits per client with Retry-After", async () => {
    const { POST } = await loadRoute();
    const req = () =>
      post({ transcript: TRANSCRIPT, engine: "offline" }, { "x-forwarded-for": "9.9.9.9" });
    for (let i = 0; i < 3; i++) expect((await POST(req())).status).toBe(200);
    const blocked = await POST(req());
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await blocked.json()).toMatchObject({ code: "rate_limited" });

    const other = await POST(
      post({ transcript: TRANSCRIPT, engine: "offline" }, { "x-forwarded-for": "8.8.8.8" }),
    );
    expect(other.status).toBe(200);
  });

  it("returns 502 when a forced engine fails", async () => {
    vi.stubEnv("OLLAMA_HOST", "http://127.0.0.1:9");
    resetEnvCache();
    const { POST } = await loadRoute();
    const res = await POST(post({ transcript: TRANSCRIPT, engine: "gemini" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "engine_failed" });
  });

  it("returns 500 misconfigured on a bad environment", async () => {
    vi.stubEnv("OLLAMA_HOST", "definitely not a url");
    resetEnvCache();
    const { POST } = await loadRoute();
    const res = await POST(post({ transcript: TRANSCRIPT }));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "misconfigured" });
  });
});
