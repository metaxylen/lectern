import type { Segment } from "../types";

/**
 * Whisper sometimes "hallucinates" on silence, music or noise: it repeats one phrase many times or
 * invents stock outros. Feeding that to a language model wastes context and pollutes the notes,
 * so we clean the transcript before any summarization.
 */

const HALLUCINATION_PATTERNS: RegExp[] = [
  /^\s*(?:thanks?|thank you)(?: so much)?(?: for (?:watching|listening))?[.!\s]*$/i,
  /^\s*(?:please )?(?:like|subscribe)[^.!?]*[.!?]?\s*$/i,
  /^\s*(?:subtitles?|captions?) (?:by|made by)\b[^\n]*$/i,
  /^\s*(?:altyaz[ıiİI]|alt yaz[ıiİI])(?:\s[^\n]*)?$/i,
  /^\s*[iİ]zledi[ğg]iniz i[çc]in te[şs]ekk[üu]rler[.!\s]*$/i,
  /^\s*(?:www\.[^\s]+|amara\.org[^\s]*)\s*$/i,
  /^\s*\[?(?:music|müzik|applause|alkış|silence)\]?\s*$/i,
];

const FILLER_WORDS = /\b(?:um+|uh+|uhm|erm|hmm+|ee+|eee+|ıı+|şey şey)\b[,.]?\s*/gi;

export type CleanStats = {
  removedSegments: number;
  collapsedRepeats: number;
  removedFillers: number;
};

/** "the the the cat" -> "the cat"; "so so so so" -> "so". Keeps legitimate doubles ("had had"). */
export function collapseWordRepeats(text: string): { text: string; collapsed: number } {
  let collapsed = 0;
  const out = text.replace(/\b([\p{L}\p{N}']+)(?:[\s,]+\1\b){2,}/giu, (_m, word: string) => {
    collapsed++;
    return word;
  });
  return { text: out, collapsed };
}

/** Collapse a phrase (2–8 words) that is repeated 3+ times in a row into a single copy. */
export function collapsePhraseLoops(text: string): { text: string; collapsed: number } {
  let collapsed = 0;
  let out = text;
  for (let n = 8; n >= 2; n--) {
    const re = new RegExp(
      `((?:[\\p{L}\\p{N}']+[,.]?\\s+){${n - 1}}[\\p{L}\\p{N}']+[,.]?)(?:\\s+\\1){2,}`,
      "giu",
    );
    out = out.replace(re, (_m, phrase: string) => {
      collapsed++;
      return phrase;
    });
  }
  return { text: out, collapsed };
}

export function isHallucination(text: string): boolean {
  return HALLUCINATION_PATTERNS.some((re) => re.test(text.trim()));
}

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clean one line of speech. Returns "" when nothing meaningful is left. */
export function cleanText(text: string): {
  text: string;
  stats: Omit<CleanStats, "removedSegments">;
} {
  if (isHallucination(text)) return { text: "", stats: { collapsedRepeats: 0, removedFillers: 0 } };
  let removedFillers = 0;
  let t = text.replace(FILLER_WORDS, () => {
    removedFillers++;
    return "";
  });
  const words = collapseWordRepeats(t);
  const loops = collapsePhraseLoops(words.text);
  t = loops.text
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return {
    text: t,
    stats: { collapsedRepeats: words.collapsed + loops.collapsed, removedFillers },
  };
}

/**
 * Clean timestamped segments: drop stock hallucinations and segments that merely repeat the
 * previous one, and tidy stutters and fillers. Timestamps of the remaining segments are kept.
 */
export function cleanSegments(segments: Segment[]): { segments: Segment[]; stats: CleanStats } {
  const stats: CleanStats = { removedSegments: 0, collapsedRepeats: 0, removedFillers: 0 };
  const out: Segment[] = [];
  let previous = "";
  for (const seg of segments) {
    const cleaned = cleanText(seg.text);
    stats.collapsedRepeats += cleaned.stats.collapsedRepeats;
    stats.removedFillers += cleaned.stats.removedFillers;
    const norm = normalizeForCompare(cleaned.text);
    if (!cleaned.text || !norm || norm === previous) {
      stats.removedSegments++;
      continue;
    }
    previous = norm;
    out.push({ ...seg, text: cleaned.text });
  }
  return { segments: out, stats };
}
