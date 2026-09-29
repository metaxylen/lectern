import { describe, expect, it, vi } from "vitest";
import { NotesRequestError, requestNotes } from "./notes-client";

const TRANSCRIPT =
  "A thread is a unit of execution. Threads share memory. This is important for the exam. Processes do not share memory.";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("requestNotes", () => {
  it("posts the parsed language settings and returns the server result", async () => {
    const result = { notes: { title: "t" }, engine: "ollama", fallbackReasons: [] };
    const fetchMock = vi.fn(() => json(result));
    const out = await requestNotes(TRANSCRIPT, "en-glossary", "auto", fetchMock as never);
    expect(out).toEqual(result);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/notes");
    expect(JSON.parse(init.body as string)).toEqual({
      transcript: TRANSCRIPT,
      language: "en",
      glossary: true,
      engine: "auto",
    });
  });

  it("falls back to the in-browser summarizer when the server is unreachable", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const out = await requestNotes(TRANSCRIPT, "en", "auto", fetchMock as never);
    expect(out.engine).toBe("offline");
    expect(out.fallbackReasons[0]).toMatch(/unreachable/);
    expect(out.notes.title).toBeTruthy();
  });

  it("surfaces server errors instead of hiding them", async () => {
    const fetchMock = vi.fn(() => json({ error: "Too many requests", code: "rate_limited" }, 429));
    const err = await requestNotes(TRANSCRIPT, "en", "auto", fetchMock as never).catch((e) => e);
    expect(err).toBeInstanceOf(NotesRequestError);
    expect(err).toMatchObject({ message: "Too many requests", status: 429, code: "rate_limited" });
  });

  it("handles non-JSON error bodies", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response("<html>bad gateway</html>", { status: 502 })),
    );
    await expect(requestNotes(TRANSCRIPT, "en", "auto", fetchMock as never)).rejects.toThrow(
      /Notes request failed \(502\)/,
    );
  });
});
