import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MODEL_CACHE_NAME,
  deleteCachedModel,
  listCachedModels,
  urlBelongsToModel,
} from "./model-cache";

class FakeCache {
  entries = new Map<string, Response>();
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
  async match(req: Request) {
    return this.entries.get(req.url)?.clone();
  }
  async delete(req: Request) {
    return this.entries.delete(req.url);
  }
}

const BASE = "https://huggingface.co/onnx-community";
const file = (bytes: number) =>
  new Response(new Uint8Array(bytes), { headers: { "content-length": String(bytes) } });

function installCache(cache: FakeCache) {
  const opened: string[] = [];
  vi.stubGlobal("caches", {
    open: async (name: string) => {
      opened.push(name);
      return cache;
    },
  });
  return opened;
}

afterEach(() => vi.unstubAllGlobals());

describe("urlBelongsToModel", () => {
  it("matches only the exact model repo", () => {
    expect(
      urlBelongsToModel(`${BASE}/whisper-base/resolve/main/x.onnx`, "onnx-community/whisper-base"),
    ).toBe(true);
    expect(
      urlBelongsToModel(
        `${BASE}/whisper-base.en/resolve/main/x.onnx`,
        "onnx-community/whisper-base",
      ),
    ).toBe(false);
    expect(
      urlBelongsToModel(`${BASE}/whisper-small/resolve/main/x.onnx`, "onnx-community/whisper-base"),
    ).toBe(false);
  });
});

describe("listCachedModels / deleteCachedModel", () => {
  it("sums sizes per known model and ignores unrelated entries", async () => {
    const cache = new FakeCache();
    cache.entries.set(`${BASE}/whisper-base/resolve/main/a.onnx`, file(100));
    cache.entries.set(`${BASE}/whisper-base/resolve/main/b.json`, file(20));
    cache.entries.set(`${BASE}/whisper-tiny/resolve/main/a.onnx`, file(7));
    cache.entries.set("https://example.com/other", file(999));
    const opened = installCache(cache);

    const models = await listCachedModels();
    expect(opened[0]).toBe(MODEL_CACHE_NAME);
    expect(models).toEqual([
      { id: "onnx-community/whisper-tiny", bytes: 7, files: 1 },
      { id: "onnx-community/whisper-base", bytes: 120, files: 2 },
    ]);
  });

  it("deletes only the chosen model's files", async () => {
    const cache = new FakeCache();
    cache.entries.set(`${BASE}/whisper-base/resolve/main/a.onnx`, file(1));
    cache.entries.set(`${BASE}/whisper-tiny/resolve/main/a.onnx`, file(1));
    installCache(cache);
    expect(await deleteCachedModel("onnx-community/whisper-base")).toBe(1);
    expect([...cache.entries.keys()]).toEqual([`${BASE}/whisper-tiny/resolve/main/a.onnx`]);
  });

  it("degrades to empty when the Cache API is missing", async () => {
    vi.stubGlobal("caches", undefined);
    expect(await listCachedModels()).toEqual([]);
    expect(await deleteCachedModel("onnx-community/whisper-base")).toBe(0);
  });
});
