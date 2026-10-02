import type { Segment } from "./types";

/** 75 -> "1:15", 3725 -> "1:02:05" */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function sortSegments(segments: Segment[]): Segment[] {
  return [...segments].sort((a, b) => a.start - b.start);
}

/** Plain transcript text: what the notes engines receive. */
export function joinSegments(segments: Segment[]): string {
  return segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(" ");
}

/** One `[m:ss] text` line per segment, for Markdown export. */
export function segmentsToTimestampedText(segments: Segment[]): string {
  return segments
    .filter((s) => s.text.trim())
    .map((s) => `[${formatTimestamp(s.start)}] ${s.text.trim()}`)
    .join("\n");
}

/** Parse `1:15` or `1:02:05` into seconds. */
export function parseTimestampToSeconds(ts: string): number {
  const parts = ts.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return NaN;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return NaN;
}

const TIMESTAMP_LINE = /^\[(\d+:\d{2}(?::\d{2})?)\]\s*(.+)$/;

/**
 * Parse `[m:ss] text` lines from the transcript editor. Returns null if the text is not in that
 * format (plain paragraph edit).
 */
export function parseTimestampedText(text: string): Segment[] | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const segments: Segment[] = [];
  for (const line of lines) {
    const m = line.match(TIMESTAMP_LINE);
    if (!m) return null;
    const start = parseTimestampToSeconds(m[1]);
    if (!Number.isFinite(start)) return null;
    segments.push({ start, end: start, text: m[2] });
  }
  for (let i = 0; i < segments.length; i++) {
    segments[i].end =
      i + 1 < segments.length ? segments[i + 1].start : segments[i].start + 1;
  }
  return sortSegments(segments);
}

/** Index of the segment being spoken at `time`, or -1 before the first one. */
export function findSegmentIndex(segments: Segment[], time: number): number {
  let found = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].start <= time) found = i;
    else break;
  }
  return found;
}
