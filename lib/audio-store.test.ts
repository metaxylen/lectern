import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  countChunks,
  createSession,
  deleteSession,
  getChunks,
  getSession,
  isAudioStoreAvailable,
  listSessions,
  listUnfinishedSessions,
  patchChunk,
  putChunk,
  resetAudioStoreForTests,
  sessionBytes,
  updateSession,
  type AudioChunk,
} from "./audio-store";

const session = (id: string, createdAt = 1) => ({
  id,
  createdAt,
  source: "mic" as const,
  title: id,
  audioLanguage: "auto",
  notesLanguage: "en",
  sttEngine: "test",
});

const chunk = (
  sessionId: string,
  index: number,
  bytes = 10,
  extra: Partial<AudioChunk> = {},
): AudioChunk => ({
  sessionId,
  index,
  blob: new Blob([new Uint8Array(bytes)], { type: "audio/webm" }),
  mimeType: "audio/webm",
  complete: true,
  durationSec: 20,
  status: "pending",
  ...extra,
});

beforeEach(async () => {
  await resetAudioStoreForTests();
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

describe("audio-store", () => {
  it("is available with IndexedDB present", async () => {
    expect(await isAudioStoreAvailable()).toBe(true);
  });

  it("creates, reads and updates sessions", async () => {
    const created = await createSession(session("a"));
    expect(created.status).toBe("recording");
    expect((await getSession("a"))?.title).toBe("a");

    await updateSession("a", { status: "complete", title: "renamed" });
    expect(await getSession("a")).toMatchObject({ status: "complete", title: "renamed", id: "a" });
    await expect(updateSession("missing", { title: "x" })).resolves.toBeUndefined();
  });

  it("lists sessions newest first", async () => {
    await createSession(session("old", 1));
    await createSession(session("new", 2));
    expect((await listSessions()).map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("stores chunks ordered by index and scoped to their session", async () => {
    await createSession(session("a"));
    await createSession(session("b"));
    await putChunk(chunk("a", 2));
    await putChunk(chunk("a", 0));
    await putChunk(chunk("a", 10));
    await putChunk(chunk("b", 0));
    expect((await getChunks("a")).map((c) => c.index)).toEqual([0, 2, 10]);
    expect(await countChunks("b")).toBe(1);
  });

  it("round-trips blob contents", async () => {
    await createSession(session("a"));
    await putChunk(chunk("a", 0, 5));
    const [c] = await getChunks("a");
    expect(c.blob.size).toBe(5);
    expect(c.mimeType).toBe("audio/webm");
  });

  it("overwrites a partial chunk with the final one", async () => {
    await createSession(session("a"));
    await putChunk(chunk("a", 0, 4, { complete: false }));
    await putChunk(chunk("a", 0, 9, { complete: true }));
    const chunks = await getChunks("a");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ complete: true });
    expect(chunks[0].blob.size).toBe(9);
  });

  it("patches transcription results without touching audio", async () => {
    await createSession(session("a"));
    await putChunk(chunk("a", 0, 7));
    await patchChunk("a", 0, {
      status: "done",
      segments: [{ start: 0, end: 20, text: "hello", language: "en" }],
    });
    const [c] = await getChunks("a");
    expect(c.status).toBe("done");
    expect(c.segments?.[0].text).toBe("hello");
    expect(c.blob.size).toBe(7);
    await expect(patchChunk("a", 99, { status: "failed" })).resolves.toBeUndefined();
  });

  it("sums bytes per session", async () => {
    await createSession(session("a"));
    await putChunk(chunk("a", 0, 100));
    await putChunk(chunk("a", 1, 50));
    expect(await sessionBytes("a")).toBe(150);
  });

  it("deletes a session with its chunks and leaves others alone", async () => {
    await createSession(session("a"));
    await createSession(session("b"));
    await putChunk(chunk("a", 0));
    await putChunk(chunk("b", 0));
    await deleteSession("a");
    expect(await getSession("a")).toBeUndefined();
    expect(await countChunks("a")).toBe(0);
    expect(await countChunks("b")).toBe(1);
    await expect(deleteSession("never-existed")).resolves.toBeUndefined();
  });

  it("finds unfinished sessions and cleans up empty ones", async () => {
    await createSession(session("crashed"));
    await putChunk(chunk("crashed", 0));
    await createSession(session("empty"));
    await createSession({ ...session("done"), status: "complete" });
    await putChunk(chunk("done", 0));

    const unfinished = await listUnfinishedSessions();
    expect(unfinished.map((s) => s.id)).toEqual(["crashed"]);
    expect(await getSession("empty")).toBeUndefined();
    expect(await getSession("done")).toBeDefined();
  });
});

describe("listUnfinishedSessions idle filter", () => {
  it("hides sessions written to recently (a live recording in another tab)", async () => {
    await createSession(session("live"));
    await putChunk(chunk("live", 0));
    expect(await listUnfinishedSessions(60_000)).toEqual([]);
    expect((await listUnfinishedSessions(0)).map((s) => s.id)).toEqual(["live"]);
  });
});

describe("audio-store without IndexedDB", () => {
  it("reports unavailable and rejects operations", async () => {
    await resetAudioStoreForTests();
    const original = globalThis.indexedDB;
    (globalThis as { indexedDB?: unknown }).indexedDB = undefined;
    expect(await isAudioStoreAvailable()).toBe(false);
    await expect(createSession(session("a"))).rejects.toThrow(/IndexedDB/);
    (globalThis as { indexedDB?: unknown }).indexedDB = original;
  });
});
