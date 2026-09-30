import { splitSentences } from "../extractive";
import type { Segment } from "../types";

export type TranscriptChunk = {
  /** Seconds where this chunk begins, when the transcript has timestamps. */
  start?: number;
  end?: number;
  text: string;
};

/** Turn plain text (no timestamps) into pseudo-segments so one code path handles both. */
export function textToSegments(text: string): Segment[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const sentences = splitSentences(trimmed);
  const units = sentences.length ? sentences : [trimmed];
  return units.map((u) => ({ start: NaN, end: NaN, text: u }));
}

const hasTime = (s: Segment) => Number.isFinite(s.start);

/**
 * Group segments into chunks of at most `maxChars`, never splitting a segment. A single segment
 * longer than the budget becomes its own chunk (split on sentence boundaries if possible).
 */
export function chunkSegments(segments: Segment[], maxChars: number): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let current: Segment[] = [];
  let size = 0;

  const flush = () => {
    if (!current.length) return;
    const timed = current.every(hasTime);
    chunks.push({
      start: timed ? current[0].start : undefined,
      end: timed ? current[current.length - 1].end : undefined,
      text: current.map((s) => s.text).join(" "),
    });
    current = [];
    size = 0;
  };

  for (const seg of segments) {
    const pieces =
      seg.text.length > maxChars
        ? splitLongText(seg.text, maxChars).map((t) => ({ ...seg, text: t }))
        : [seg];
    for (const piece of pieces) {
      if (size + piece.text.length + 1 > maxChars) flush();
      current.push(piece);
      size += piece.text.length + 1;
    }
  }
  flush();
  return chunks;
}

function splitLongText(text: string, maxChars: number): string[] {
  const sentences = splitSentences(text);
  const parts: string[] = [];
  let buf = "";
  const push = () => {
    if (buf) parts.push(buf);
    buf = "";
  };
  for (const s of sentences.length ? sentences : [text]) {
    if (s.length > maxChars) {
      push();
      for (let i = 0; i < s.length; i += maxChars) parts.push(s.slice(i, i + maxChars));
      continue;
    }
    if (buf.length + s.length + 1 > maxChars) push();
    buf += (buf ? " " : "") + s;
  }
  push();
  return parts;
}

/** Render a transcript with `[m:ss]` markers so a model can cite where things were said. */
export function renderWithTimestamps(segments: Segment[]): string {
  return segments
    .map((s) => {
      if (!hasTime(s)) return s.text;
      const t = Math.max(0, Math.floor(s.start));
      const label = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      return `[${label}] ${s.text}`;
    })
    .join("\n");
}

/** Parse a `m:ss` or `h:mm:ss` marker (as produced above) into seconds, or undefined. */
export function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value !== "string") return undefined;
  const m = value
    .trim()
    .replace(/^\[|\]$/g, "")
    .match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
  }
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
