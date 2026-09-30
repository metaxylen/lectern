import { parseNotesLanguage } from "./languages";
import { offlineNotes } from "./notes/offline";
import { prepareTranscriptClient } from "./notes/prepare";
import type { NotesEngineChoice, NotesResult, Segment } from "./types";

/** Thrown when the server answered but refused/failed; the caller should show its message. */
export class NotesRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "NotesRequestError";
  }
}

export type NotesRequest = {
  transcript: string;
  segments?: Segment[];
  /** Student's hints: course, topic, spellings. */
  context?: string;
  /** A notes-language option value such as "en-glossary" or "tr". */
  notesLanguage: string;
  engine: NotesEngineChoice;
};

export type NotesRequestOptions = {
  onProgress?: (message: string, done?: number, total?: number) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

/**
 * Ask the server for notes, streaming progress while a long lecture is processed. If the server is
 * unreachable (offline, dev server down) fall back to the in-browser offline summarizer so the
 * user still gets something. Real server-side errors (rate limit, bad request, engine failure) are
 * surfaced instead of silently degraded.
 */
export async function requestNotes(
  req: NotesRequest,
  opts: NotesRequestOptions = {},
): Promise<NotesResult> {
  const { onProgress, signal, fetchImpl = fetch } = opts;
  const { language, glossary } = parseNotesLanguage(req.notesLanguage);
  let res: Response;
  try {
    res = await fetchImpl("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        transcript: req.transcript,
        segments: req.segments?.length ? req.segments : undefined,
        context: req.context?.trim() || undefined,
        language,
        glossary,
        engine: req.engine,
        stream: true,
      }),
    });
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err;
    const { segments, plain } = prepareTranscriptClient(req.transcript, req.segments);
    return {
      notes: offlineNotes(plain, segments),
      engine: "offline",
      fallbackReasons: ["server: unreachable, used in-browser offline summarizer"],
      warnings: [],
    };
  }

  if (!res.ok) {
    let body: { error?: string; code?: string } = {};
    try {
      body = (await res.json()) ?? {};
    } catch {
      // Non-JSON body (proxy error page, etc.)
    }
    throw new NotesRequestError(
      body.error ?? `Notes request failed (${res.status})`,
      res.status,
      body.code,
    );
  }

  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("ndjson") || !res.body) {
    return (await res.json()) as NotesResult; // Older servers answer with plain JSON.
  }
  return readStream(res.body, onProgress);
}

async function readStream(
  body: ReadableStream<Uint8Array>,
  onProgress?: NotesRequestOptions["onProgress"],
): Promise<NotesResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: NotesResult | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as
      | { type: "progress"; message: string; done?: number; total?: number }
      | { type: "result"; result: NotesResult }
      | { type: "error"; error: string; code?: string };
    if (event.type === "progress") onProgress?.(event.message, event.done, event.total);
    else if (event.type === "result") result = event.result;
    else if (event.type === "error") throw new NotesRequestError(event.error, 502, event.code);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      handle(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
    if (done) break;
  }
  handle(buffer);
  if (!result) throw new NotesRequestError("The notes stream ended without a result.", 502);
  return result;
}
