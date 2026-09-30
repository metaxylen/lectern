import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "../env";
import { createGeminiClient, createOllamaClient, pickOllamaModel } from "./llm";

beforeEach(() => {
  vi.stubEnv("OLLAMA_HOST", "http://ollama.test");
  vi.stubEnv("OLLAMA_MODEL", "");
  vi.stubEnv("GEMINI_API_KEY", "secret");
  resetEnvCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvCache();
});

const GB = 1e9;
const m = (name: string, gb: number) => ({ name, size: gb * GB });
const RAM_24 = 24 * GB; // budget: 14.4 GB

describe("pickOllamaModel", () => {
  it("honours a forced model", () => {
    expect(pickOllamaModel([m("llama3:8b", 5)], "custom:1b", RAM_24)).toBe("custom:1b");
  });

  it("prefers newer families in order", () => {
    expect(pickOllamaModel([m("qwen2.5:14b", 9), m("gemma4:12b", 8)], "", RAM_24)).toBe(
      "gemma4:12b",
    );
    expect(pickOllamaModel([m("mistral:7b", 4), m("qwen2.5:7b", 4.7)], "", RAM_24)).toBe(
      "qwen2.5:7b",
    );
  });

  it("takes the largest model of the family that fits in memory", () => {
    const installed = [
      m("gemma4:e4b", 4),
      m("gemma4:12b", 8),
      m("gemma4:26b", 18.7),
      m("gemma4:31b", 20.4),
    ];
    expect(pickOllamaModel(installed, "", RAM_24)).toBe("gemma4:12b");
    expect(pickOllamaModel(installed, "", 64 * GB)).toBe("gemma4:31b");
  });

  it("falls back to the smallest of the family when nothing fits", () => {
    expect(pickOllamaModel([m("qwen3.8:27b", 17.7), m("qwen3.8:70b", 40)], "", 16 * GB)).toBe(
      "qwen3.8:27b",
    );
  });

  it("does not confuse families by prefix", () => {
    expect(pickOllamaModel([m("qwen3.8:27b", 17.7), m("qwen3:8b", 5)], "", 64 * GB)).toBe(
      "qwen3.8:27b",
    );
    expect(pickOllamaModel([m("qwen3:8b", 5)], "", RAM_24)).toBe("qwen3:8b");
  });

  it("falls back to the first model, or null", () => {
    expect(pickOllamaModel([m("weird-model", 1)], "", RAM_24)).toBe("weird-model");
    expect(pickOllamaModel([], "", RAM_24)).toBeNull();
  });
});

describe("createOllamaClient", () => {
  const tags = () =>
    Promise.resolve(
      new Response(JSON.stringify({ models: [{ name: "qwen2.5:7b", size: 4.7e9 }] })),
    );

  it("sends the schema as a constrained format and returns the message content", async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL, _init?: RequestInit) =>
      String(url).includes("/api/tags")
        ? tags()
        : Promise.resolve(new Response(JSON.stringify({ message: { content: '{"a":1}' } }))),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = await createOllamaClient();
    expect(client).toMatchObject({ engine: "ollama", model: "qwen2.5:7b" });
    const schema = { type: "object" };
    expect(await client.generateJson("hi", { schema })).toBe('{"a":1}');
    const chat = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/chat"));
    const body = JSON.parse((chat?.[1] as RequestInit).body as string);
    expect(body.format).toEqual(schema);
    expect(body.options.num_ctx).toBe(16_384);
    expect(body.messages[0].content).toBe("hi");
    expect(body.think).toBe(false);
  });

  it("throws helpful errors when Ollama is down or empty", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("refused")));
    await expect(createOllamaClient()).rejects.toThrow(/not reachable at http:\/\/ollama.test/);
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ models: [] }))));
    await expect(createOllamaClient()).rejects.toThrow(/no models/);
  });

  it("surfaces HTTP errors from the model", async () => {
    vi.stubGlobal("fetch", (url: RequestInfo | URL) =>
      String(url).includes("/api/tags")
        ? tags()
        : Promise.resolve(new Response("boom", { status: 500 })),
    );
    const client = await createOllamaClient();
    await expect(client.generateJson("x")).rejects.toThrow(/Ollama error 500: boom/);
  });
});

describe("createGeminiClient", () => {
  it("keeps the key in a header, never in the URL", async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] })),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = await createGeminiClient();
    expect(await client.generateJson("hi")).toBe("{}");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("secret");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
  });

  it("requires a key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    resetEnvCache();
    await expect(createGeminiClient()).rejects.toThrow(/GEMINI_API_KEY/);
  });
});
