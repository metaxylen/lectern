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

/** Index of the segment being spoken at `time`, or -1 before the first one. */
export function findSegmentIndex(segments: Segment[], time: number): number {
  let found = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].start <= time) found = i;
    else break;
  }
  return found;
}
