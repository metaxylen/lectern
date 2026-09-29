import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "../env";
import { generateNotes, getEngineStatus } from "./index";

const TRANSCRIPT =
  "A thread is a unit of execution. Threads share memory. This is important for the exam. Processes do not share memory.";

const modelNotes = {
  title: "Model title",
  summary: "Model summary",
  keyPoints: ["k1"],
  definitions: [],
  examQuestions: [],
};

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));

function routeFetch(handlers: Record<string, () => Promise<Response>>) {
  return vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    for (const [needle, handler] of Object.entries(handlers))
      if (url.includes(needle)) return handler();
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

beforeEach(() => {
  vi.stubEnv("OLLAMA_HOST", "http://ollama.test");
  vi.stubEnv("OLLAMA_MODEL", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvCache();
});

describe("generateNotes", () => {
  it("uses Ollama first when it is reachable", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "/api/tags": () => ok({ models: [{ name: "llama3:8b" }, { name: "nomic-embed-text" }] }),
        "/api/chat": () => ok({ message: { content: JSON.stringify(modelNotes) } }),
      }),
    );
    const r = await generateNotes(TRANSCRIPT, "en", "auto");
    expect(r).toMatchObject({ engine: "ollama", model: "llama3:8b", fallbackReasons: [] });
    expect(r.notes.title).toBe("Model title");
  });

  it("falls back through Gemini to offline, recording why", async () => {
    vi.stubGlobal("fetch", routeFetch({ "/api/tags": () => Promise.reject(new Error("refused")) }));
    const r = await generateNotes(TRANSCRIPT, "en", "auto");
    expect(r.engine).toBe("offline");
    expect(r.fallbackReasons).toHaveLength(2);
    expect(r.fallbackReasons[0]).toMatch(/^ollama: Ollama not reachable/);
    expect(r.fallbackReasons[1]).toBe("gemini: GEMINI_API_KEY is not set");
  });

  it("uses Gemini when Ollama is down and a key is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret");
    resetEnvCache();
    const fetchMock = routeFetch({
      "/api/tags": () => Promise.reject(new Error("refused")),
      "generativelanguage.googleapis.com": () =>
        ok({ candidates: [{ content: { parts: [{ text: JSON.stringify(modelNotes) }] } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateNotes(TRANSCRIPT, "en", "auto");
    expect(r.engine).toBe("gemini");
    const geminiCall = fetchMock.mock.calls.find(([u]) => String(u).includes("googleapis"));
    expect((geminiCall?.[1] as RequestInit).headers).toMatchObject({ "x-goog-api-key": "secret" });
    expect(String(geminiCall?.[0])).not.toContain("secret");
  });

  it("does not silently fall back when an engine is forced", async () => {
    vi.stubGlobal("fetch", routeFetch({ "/api/tags": () => Promise.reject(new Error("refused")) }));
    await expect(generateNotes(TRANSCRIPT, "en", "ollama")).rejects.toThrow(/Ollama not reachable/);
    await expect(generateNotes(TRANSCRIPT, "en", "gemini")).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it("forcing offline never touches the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await generateNotes(TRANSCRIPT, "en", "offline");
    expect(r.engine).toBe("offline");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back when a model returns unusable JSON", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "/api/tags": () => ok({ models: [{ name: "qwen2.5:7b" }] }),
        "/api/chat": () => ok({ message: { content: '{"title":"only title"}' } }),
      }),
    );
    const r = await generateNotes(TRANSCRIPT, "en", "auto");
    expect(r.engine).toBe("offline");
    expect(r.fallbackReasons[0]).toMatch(/incomplete notes JSON/);
  });
});

describe("getEngineStatus", () => {
  it("reports reachability, selected model and gemini config", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    resetEnvCache();
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "/api/tags": () => ok({ models: [{ name: "mistral:7b" }, { name: "qwen2.5:3b" }] }),
      }),
    );
    const s = await getEngineStatus();
    expect(s.ollama).toMatchObject({
      reachable: true,
      host: "http://ollama.test",
      selected: "qwen2.5:3b",
    });
    expect(s.gemini).toEqual({ configured: true, model: "gemini-flash-latest" });
  });

  it("reports an unreachable Ollama without throwing", async () => {
    vi.stubGlobal("fetch", routeFetch({ "/api/tags": () => Promise.reject(new Error("refused")) }));
    const s = await getEngineStatus();
    expect(s.ollama).toMatchObject({ reachable: false, models: [], selected: null });
  });
});
