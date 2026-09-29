import { extractiveNotes } from "./extractive";
import { parseNotesLanguage } from "./languages";
import type { NotesEngineChoice, NotesResult } from "./types";

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

/**
 * Ask the server for notes. If the server is unreachable (offline, dev server down) fall back to
 * the in-browser offline summarizer so the user still gets something. Real server-side errors
 * (rate limit, bad request, engine failure) are surfaced instead of silently degraded.
 */
export async function requestNotes(
  transcript: string,
  notesLanguage: string,
  engine: NotesEngineChoice,
  fetchImpl: typeof fetch = fetch,
): Promise<NotesResult> {
  const { language, glossary } = parseNotesLanguage(notesLanguage);
  let res: Response;
  try {
    res = await fetchImpl("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, language, glossary, engine }),
    });
  } catch {
    return {
      notes: extractiveNotes(transcript),
      engine: "offline",
      fallbackReasons: ["server: unreachable, used in-browser offline summarizer"],
    };
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON body (proxy error page, etc.) handled below.
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; code?: string };
    throw new NotesRequestError(
      body.error ?? `Notes request failed (${res.status})`,
      res.status,
      body.code,
    );
  }
  return data as NotesResult;
}
