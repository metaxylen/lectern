import type { Segment } from "../types";
import { normalizeForMatch } from "./ground";

/**
 * Words lecturers use when they tell students what matters for assessment. Matched on the
 * accent-stripped, lowercase text, so "Sınav"/"sinav" and "ödev"/"odev" both work.
 */
const CUE =
  /\b(?:exams?|midterms?|finals?|quiz(?:zes)?|homeworks?|assignments?|deadlines?|due|remember|memori[sz]e|important|pay attention|do not forget|dont forget|sinav\w*|vize\w*|final\w*|odev\w*|cikacak|cikar|cikabilir|cikmasi|ezber\w*|unutmay\w*|mutlaka|dikkat|onemli|soracagim|sorarim)\b/;

export type HintCandidate = { text: string; start?: number };

/**
 * Segments that contain an assessment cue, each with the segment before it for context (the
 * subject is usually named one sentence earlier: "Semaphores... bunu iyi anlayın, vizede çıkacak").
 */
export function findHintCandidates(segments: Segment[], max = 14): HintCandidate[] {
  const out: HintCandidate[] = [];
  for (let i = 0; i < segments.length && out.length < max; i++) {
    if (!CUE.test(normalizeForMatch(segments[i].text))) continue;
    const previous = i > 0 ? segments[i - 1].text : "";
    out.push({
      text: [previous, segments[i].text].filter(Boolean).join(" "),
      start: Number.isFinite(segments[i].start) ? segments[i].start : undefined,
    });
  }
  return out;
}

const tokens = (s: string) =>
  new Set(
    normalizeForMatch(s)
      .split(" ")
      .filter((w) => w.length > 3),
  );

/** Words shared relative to the smaller hint; robust to one being a paraphrase of the other. */
export function overlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

/** Merge hint lists, dropping near-duplicates (same remark found twice, or worded differently). */
export function mergeHints(...lists: string[][]): string[] {
  const out: string[] = [];
  for (const hint of lists.flat()) {
    const text = hint.trim();
    // A bare "bu önemli" / "important" names nothing the student can act on.
    if (text.split(/\s+/).length < 4) continue;
    if (out.some((kept) => overlap(kept, text) >= 0.6)) continue;
    out.push(text);
  }
  return out;
}
