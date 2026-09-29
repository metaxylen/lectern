import type { Segment } from "./types";

/**
 * Crash-safe local storage for lecture audio, backed by IndexedDB.
 *
 * A recording is a *session* made of *chunks*. Every chunk is written the moment it exists (and the
 * in-progress chunk is re-written every couple of seconds), so closing the tab, a crash or a dead
 * battery loses at most a moment of audio. Each chunk also records its own transcription result, so
 * an interrupted job can be resumed without redoing finished work.
 *
 * Session id === lecture id. Every function rejects if IndexedDB is unavailable; callers treat
 * persistence as best-effort and keep working in memory.
 */

const DB_NAME = "stt-audio";
const DB_VERSION = 1;
const SESSIONS = "sessions";
const CHUNKS = "chunks";

export type SessionStatus = "recording" | "complete";

export type AudioSession = {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** "recording" means it was never cleanly finished: offer recovery. */
  status: SessionStatus;
  source: "mic" | "file";
  title: string;
  fileName?: string;
  audioLanguage: string;
  notesLanguage: string;
  sttEngine: string;
};

export type ChunkStatus = "pending" | "done" | "failed" | "silent";

export type AudioChunk = {
  sessionId: string;
  index: number;
  blob: Blob;
  mimeType: string;
  /** False while the recorder is still writing this chunk (a valid but truncated file). */
  complete: boolean;
  durationSec: number;
  status: ChunkStatus;
  segments?: Segment[];
  error?: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSIONS)) {
        db.createObjectStore(SESSIONS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CHUNKS)) {
        db.createObjectStore(CHUNKS, { keyPath: ["sessionId", "index"] });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading or the browser reclaiming storage closes us: reopen next time.
      db.onclose = () => (dbPromise = null);
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("Could not open IndexedDB"));
    req.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

const wrap = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });

/** Run `fn` inside one transaction and resolve once it has *committed* (not just queued). */
async function transact<T>(
  stores: string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
  const result = await fn(tx);
  await done;
  return result;
}

const chunkRange = (sessionId: string) => IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity]);

export async function isAudioStoreAvailable(): Promise<boolean> {
  try {
    await openDb();
    return true;
  } catch {
    return false;
  }
}

export async function createSession(
  session: Omit<AudioSession, "updatedAt" | "status"> & { status?: SessionStatus },
): Promise<AudioSession> {
  const full: AudioSession = { status: "recording", ...session, updatedAt: Date.now() };
  await transact([SESSIONS], "readwrite", (tx) => wrap(tx.objectStore(SESSIONS).put(full)));
  return full;
}

export async function getSession(id: string): Promise<AudioSession | undefined> {
  return transact([SESSIONS], "readonly", (tx) => wrap(tx.objectStore(SESSIONS).get(id)));
}

export async function updateSession(id: string, patch: Partial<AudioSession>): Promise<void> {
  await transact([SESSIONS], "readwrite", async (tx) => {
    const store = tx.objectStore(SESSIONS);
    const existing = (await wrap(store.get(id))) as AudioSession | undefined;
    if (!existing) return;
    await wrap(store.put({ ...existing, ...patch, id, updatedAt: Date.now() }));
  });
}

export async function listSessions(): Promise<AudioSession[]> {
  const all = await transact([SESSIONS], "readonly", (tx) =>
    wrap(tx.objectStore(SESSIONS).getAll() as IDBRequest<AudioSession[]>),
  );
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** Sessions that were never finished cleanly and still hold audio. */
export async function listUnfinishedSessions(): Promise<AudioSession[]> {
  const unfinished = (await listSessions()).filter((s) => s.status === "recording");
  const withAudio: AudioSession[] = [];
  for (const s of unfinished) {
    if ((await countChunks(s.id)) > 0) withAudio.push(s);
    else await deleteSession(s.id); // Started but nothing was captured: nothing to recover.
  }
  return withAudio;
}

export async function putChunk(chunk: AudioChunk): Promise<void> {
  await transact([CHUNKS], "readwrite", (tx) => wrap(tx.objectStore(CHUNKS).put(chunk)));
}

export async function patchChunk(
  sessionId: string,
  index: number,
  patch: Partial<Omit<AudioChunk, "sessionId" | "index">>,
): Promise<void> {
  await transact([CHUNKS], "readwrite", async (tx) => {
    const store = tx.objectStore(CHUNKS);
    const existing = (await wrap(store.get([sessionId, index]))) as AudioChunk | undefined;
    if (!existing) return;
    await wrap(store.put({ ...existing, ...patch, sessionId, index }));
  });
}

export async function getChunks(sessionId: string): Promise<AudioChunk[]> {
  const chunks = await transact([CHUNKS], "readonly", (tx) =>
    wrap(tx.objectStore(CHUNKS).getAll(chunkRange(sessionId)) as IDBRequest<AudioChunk[]>),
  );
  return chunks.sort((a, b) => a.index - b.index);
}

export async function countChunks(sessionId: string): Promise<number> {
  return transact([CHUNKS], "readonly", (tx) =>
    wrap(tx.objectStore(CHUNKS).count(chunkRange(sessionId))),
  );
}

export async function sessionBytes(sessionId: string): Promise<number> {
  return (await getChunks(sessionId)).reduce((sum, c) => sum + c.blob.size, 0);
}

/** Remove a session and all of its audio. Safe to call for ids that do not exist. */
export async function deleteSession(sessionId: string): Promise<void> {
  await transact([SESSIONS, CHUNKS], "readwrite", async (tx) => {
    await wrap(tx.objectStore(CHUNKS).delete(chunkRange(sessionId)));
    await wrap(tx.objectStore(SESSIONS).delete(sessionId));
  });
}

export type StorageEstimate = { usage: number; quota: number } | null;

export async function estimateStorage(): Promise<StorageEstimate> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (e?.quota) return { usage: e.usage ?? 0, quota: e.quota };
  } catch {
    // ignore
  }
  return null;
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Test helper: forget the open connection (and let tests delete the database). */
export async function resetAudioStoreForTests() {
  if (dbPromise) (await dbPromise.catch(() => null))?.close();
  dbPromise = null;
}
