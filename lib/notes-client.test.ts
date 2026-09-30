import { describe, expect, it, vi } from "vitest";
import { NotesRequestError, requestNotes } from "./notes-client";

const TRANSCRIPT =
  "A thread is a unit of execution. Threads share memory. This is important for the exam. Processes do not share memory.";
const req = { transcript: TRANSCRIPT, notesLanguage: "en", engine: "auto" as const };

const result = { notes: { title: "t" }, engine: "ollama", fallbackReasons: [] };
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function ndjson(events: unknown[], chunkSize = 7) {
  const text = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  const bytes = new TextEncoder().encode(text);
  // Deliver in tiny pieces so lines are split across chunks, like a real network.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize)
        controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    },
  });
  return Promise.resolve(
    new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } }),
  );
}

describe("requestNotes", () => {
  it("posts parsed language settings, segments and hints, and accepts a plain JSON reply", async () => {
    const fetchMock = vi.fn((_u: string, _i?: RequestInit) => json(result));
    const segments = [{ start: 0, end: 20, text: "hello" }];
    const out = await requestNotes(
      { ...req, notesLanguage: "en-glossary", segments, context: "  OS course  " },
      { fetchImpl: fetchMock as never },
    );
    expect(out).toEqual(result);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/notes");
    expect(JSON.parse(init?.body as string)).toEqual({
      transcript: TRANSCRIPT,
      segments,
      context: "OS course",
      language: "en",
      glossary: true,
      engine: "auto",
      stream: true,
    });
  });

  it("omits empty segments and hints", async () => {
    const fetchMock = vi.fn((_u: string, _i?: RequestInit) => json(result));
    await requestNotes({ ...req, segments: [], context: "   " }, { fetchImpl: fetchMock as never });
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.segments).toBeUndefined();
    expect(body.context).toBeUndefined();
  });

  it("streams progress events and returns the final result, even across chunk boundaries", async () => {
    const fetchMock = vi.fn(() =>
      ndjson([
        { type: "progress", message: "Connecting to Ollama" },
        { type: "progress", message: "Reading part 1 of 3", done: 0, total: 3 },
        { type: "result", result },
      ]),
    );
    const progress: [string, number | undefined, number | undefined][] = [];
    const out = await requestNotes(req, {
      fetchImpl: fetchMock as never,
      onProgress: (m, d, t) => progress.push([m, d, t]),
    });
    expect(out).toEqual(result);
    expect(progress).toEqual([
      ["Connecting to Ollama", undefined, undefined],
      ["Reading part 1 of 3", 0, 3],
    ]);
  });

  it("turns a streamed error into a NotesRequestError", async () => {
    const fetchMock = vi.fn(() =>
      ndjson([{ type: "error", error: "Ollama exploded", code: "engine_failed" }]),
    );
    await expect(requestNotes(req, { fetchImpl: fetchMock as never })).rejects.toMatchObject({
      name: "NotesRequestError",
      message: "Ollama exploded",
      code: "engine_failed",
    });
  });

  it("fails clearly if the stream ends without a result", async () => {
    const fetchMock = vi.fn(() => ndjson([{ type: "progress", message: "x" }]));
    await expect(requestNotes(req, { fetchImpl: fetchMock as never })).rejects.toThrow(
      /without a result/,
    );
  });

  it("falls back to the in-browser summarizer when the server is unreachable", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const out = await requestNotes(req, { fetchImpl: fetchMock as never });
    expect(out.engine).toBe("offline");
    expect(out.fallbackReasons[0]).toMatch(/unreachable/);
    expect(out.notes.title).toBeTruthy();
    expect(out.notes.examHints?.length).toBeGreaterThan(0);
  });

  it("does not fall back when the caller cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn(() => Promise.reject(new DOMException("aborted", "AbortError")));
    await expect(
      requestNotes(req, { fetchImpl: fetchMock as never, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("surfaces server errors instead of hiding them", async () => {
    const fetchMock = vi.fn(() => json({ error: "Too many requests", code: "rate_limited" }, 429));
    const err = await requestNotes(req, { fetchImpl: fetchMock as never }).catch((e) => e);
    expect(err).toBeInstanceOf(NotesRequestError);
    expect(err).toMatchObject({ message: "Too many requests", status: 429, code: "rate_limited" });
  });

  it("handles non-JSON error bodies", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response("<html>bad gateway</html>", { status: 502 })),
    );
    await expect(requestNotes(req, { fetchImpl: fetchMock as never })).rejects.toThrow(
      /Notes request failed \(502\)/,
    );
  });
});
