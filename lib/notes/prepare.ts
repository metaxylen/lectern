import { textToSegments } from "./chunk";
import { cleanSegments } from "./clean";
import type { Segment } from "../types";

/**
 * Clean a transcript and produce the plain text the summarizers work on. Shared by the server
 * pipeline and the in-browser fallback so both see exactly the same text.
 */
export function prepareTranscriptClient(transcript: string, segments?: Segment[]) {
  const base = segments?.length ? segments : textToSegments(transcript);
  const cleaned = cleanSegments(base);
  const used = cleaned.segments.length ? cleaned.segments : base;
  const timed = used.length > 0 && used.every((s) => Number.isFinite(s.start));
  return { segments: used, plain: used.map((s) => s.text).join(" "), timed, stats: cleaned.stats };
}
