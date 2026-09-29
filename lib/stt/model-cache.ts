import { WHISPER_MODEL_IDS } from "./models";

/** Cache name used by transformers.js (`env.cacheKey`). */
export const MODEL_CACHE_NAME = "transformers-cache";

export type CachedModel = { id: string; bytes: number; files: number };

function cacheAvailable(): boolean {
  return typeof caches !== "undefined";
}

/** Whether a cached request URL belongs to the given Hugging Face model repo. */
export function urlBelongsToModel(url: string, modelId: string): boolean {
  return url.includes(`/${modelId}/resolve/`);
}

/** Models with files in the browser cache, with their approximate size. */
export async function listCachedModels(): Promise<CachedModel[]> {
  if (!cacheAvailable()) return [];
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const requests = await cache.keys();
    const found: CachedModel[] = [];
    for (const id of WHISPER_MODEL_IDS) {
      const mine = requests.filter((r) => urlBelongsToModel(r.url, id));
      if (!mine.length) continue;
      let bytes = 0;
      for (const req of mine) {
        const res = await cache.match(req);
        const len = Number(res?.headers.get("content-length"));
        if (Number.isFinite(len) && len > 0) bytes += len;
        else if (res) bytes += (await res.clone().blob()).size;
      }
      found.push({ id, bytes, files: mine.length });
    }
    return found;
  } catch {
    return [];
  }
}

/** Delete every cached file of a model. Returns how many entries were removed. */
export async function deleteCachedModel(modelId: string): Promise<number> {
  if (!cacheAvailable()) return 0;
  const cache = await caches.open(MODEL_CACHE_NAME);
  const requests = (await cache.keys()).filter((r) => urlBelongsToModel(r.url, modelId));
  await Promise.all(requests.map((r) => cache.delete(r)));
  return requests.length;
}
