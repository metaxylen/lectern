import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "../env";
import type { LlmClient } from "./llm";
import { generateNotes, getEngineStatus } from "./index";

const TRANSCRIPT =
  "A thread is a unit of execution. Threads share memory. This is important for the exam. Processes do not share memory.";
const input = { transcript: TRANSCRIPT, language: "en", glossary: false };

const modelNotes = {
  title: "Model title",
  summary: "Model summary",
  keyPoints: ["k1"],
  definitions: [],
  examQuestions: [],
  examHints: [],
  flashcards: [],
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

function fakeClient(engine: "ollama" | "gemini", reply: () => string): () => Promise<LlmClient> {
  return async () => ({
    engine,
    model: `${engine}-fake`,
    singlePassChars: 10_000,
    sectionChars: 5000,
    generateJson: async () => reply(),
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
  it("uses Ollama first when it works", async () => {
    const r = await generateNotes(input, "auto", {
      clients: { ollama: fakeClient("ollama", () => JSON.stringify(modelNotes)) },
    });
    expect(r).toMatchObject({ engine: "ollama", model: "ollama-fake", fallbackReasons: [] });
    expect(r.notes.title).toBe("Model title");
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("falls through Ollama and Gemini to offline, recording why", async () => {
    const r = await generateNotes(input, "auto", {
      clients: {
        ollama: async () => {
          throw new Error("Ollama not reachable");
        },
        gemini: async () => {
          throw new Error("GEMINI_API_KEY is not set");
        },
      },
    });
    expect(r.engine).toBe("offline");
    expect(r.fallbackReasons).toEqual([
      "ollama: Ollama not reachable",
      "gemini: GEMINI_API_KEY is not set",
    ]);
  });

  it("uses Gemini when Ollama is down", async () => {
    const r = await generateNotes(input, "auto", {
      clients: {
        ollama: async () => {
          throw new Error("down");
        },
        gemini: fakeClient("gemini", () => JSON.stringify(modelNotes)),
      },
    });
    expect(r.engine).toBe("gemini");
    expect(r.model).toBe("gemini-fake");
  });

  it("does not silently fall back when an engine is forced", async () => {
    const boom = async () => {
      throw new Error("engine unavailable");
    };
    await expect(generateNotes(input, "ollama", { clients: { ollama: boom } })).rejects.toThrow(
      "engine unavailable",
    );
    await expect(generateNotes(input, "gemini", { clients: { gemini: boom } })).rejects.toThrow(
      "engine unavailable",
    );
  });

  it("forcing offline never touches a model or the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const factory = vi.fn();
    const r = await generateNotes(input, "offline", {
      clients: { ollama: factory, gemini: factory },
    });
    expect(r.engine).toBe("offline");
    expect(factory).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.notes.keyPoints.length).toBeGreaterThan(0);
  });

  it("falls back when a model keeps returning unusable JSON", async () => {
    const r = await generateNotes(input, "auto", {
      clients: { ollama: fakeClient("ollama", () => '{"title":"only title"}') },
    });
    expect(r.engine).toBe("offline");
    expect(r.fallbackReasons[0]).toMatch(/incomplete notes JSON/);
  });

  it("reports progress from the pipeline", async () => {
    const messages: string[] = [];
    await generateNotes(input, "auto", {
      clients: { ollama: fakeClient("ollama", () => JSON.stringify(modelNotes)) },
      onProgress: (p) => messages.push(p.message),
    });
    expect(messages[0]).toBe("Connecting to Ollama");
    expect(messages).toContain("Writing notes");
  });

  it("stops when the request is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(generateNotes(input, "auto", { signal: controller.signal })).rejects.toThrow();
  });
});

describe("getEngineStatus", () => {
  it("reports reachability, the preferred model and gemini config", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    resetEnvCache();
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "/api/tags": () =>
          ok({ models: [{ name: "mistral:7b" }, { name: "qwen2.5:3b" }, { name: "qwen2.5:14b" }] }),
      }),
    );
    const s = await getEngineStatus();
    expect(s.ollama).toMatchObject({
      reachable: true,
      host: "http://ollama.test",
      selected: "qwen2.5:14b", // same family, larger model wins
    });
    expect(s.gemini).toEqual({ configured: true, model: "gemini-flash-latest" });
  });

  it("reports an unreachable Ollama without throwing", async () => {
    vi.stubGlobal("fetch", routeFetch({ "/api/tags": () => Promise.reject(new Error("refused")) }));
    const s = await getEngineStatus();
    expect(s.ollama).toMatchObject({ reachable: false, models: [], selected: null });
  });
});
