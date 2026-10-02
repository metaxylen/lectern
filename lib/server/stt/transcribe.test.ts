import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("transcribeWavBytes", () => {
  it("posts the wav to whisper-server and returns parsed text", async () => {
    vi.doMock("./server", () => ({
      ensureWhisperServer: vi.fn(async () => "http://whisper.test"),
      scheduleWhisperIdleShutdown: vi.fn(),
    }));
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ text: " Hello ", language: "en" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { transcribeWavBytes } = await import("./transcribe");
    await expect(transcribeWavBytes(new Uint8Array(44), "en")).resolves.toEqual({
      text: "Hello",
      language: "en",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://whisper.test/inference",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("surfaces HTTP errors from whisper-server", async () => {
    vi.doMock("./server", () => ({
      ensureWhisperServer: vi.fn(async () => "http://whisper.test"),
      scheduleWhisperIdleShutdown: vi.fn(),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "bad wav" }), { status: 500 })),
    );
    const { transcribeWavBytes } = await import("./transcribe");
    await expect(transcribeWavBytes(new Uint8Array(44), "auto")).rejects.toThrow(/bad wav/);
  });
});

describe("warmupWhisper", () => {
  it("reports metal on darwin after the sidecar is up", async () => {
    vi.doMock("./server", () => ({
      ensureWhisperServer: vi.fn(async () => "http://whisper.test"),
      scheduleWhisperIdleShutdown: vi.fn(),
    }));
    const { warmupWhisper } = await import("./transcribe");
    await expect(warmupWhisper()).resolves.toEqual({
      ok: true,
      backend: process.platform === "darwin" ? "metal" : "cpu",
      model: "large-v3-turbo",
    });
  });
});
