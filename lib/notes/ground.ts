import type { Notes } from "../types";
import { englishForTurkish } from "./terms";

/**
 * Small models invent plausible-sounding terms. "Grounding" keeps only claims whose key words
 * actually occur in the transcript, so notes never teach something the lecturer did not say.
 */

const STOP = new Set(
  "the a an and or of to in on at by for with as is are was were be it its this that these those from into".split(
    " ",
  ),
);

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentWords(s: string): string[] {
  return normalizeForMatch(s)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Turkish and English both inflect words, so match on a stem-length prefix. */
const stem = (w: string) => w.slice(0, Math.max(4, Math.min(w.length, 6)));

/**
 * True when the term appears in the transcript: exact phrase, or (for multi-word terms) most of
 * its content words, matched by prefix so "threads" matches "thread" and "bellekte" matches "bellek".
 */
export function isGrounded(term: string, transcriptNorm: string, threshold = 0.6): boolean {
  const norm = normalizeForMatch(term);
  if (!norm) return false;
  if (transcriptNorm.includes(norm)) return true;
  const words = contentWords(term);
  if (!words.length) return false;
  const transcriptWords = new Set(transcriptNorm.split(" ").map(stem));
  const hits = words.filter((w) => transcriptWords.has(stem(w))).length;
  return hits / words.length >= threshold;
}

/**
 * Is `term` backed by the transcript? Terms in another language than the (English) lectures cannot
 * be matched word for word, so they count as supported when their English parenthetical, or the
 * English term behind a known Turkish wording, is in the transcript. A foreign term we cannot
 * judge at all is kept: dropping it would punish correct translations.
 */
export function isTermSupported(term: string, transcriptNorm: string, language = "en"): boolean {
  if (isGrounded(term, transcriptNorm)) return true;
  const parenthetical = [...term.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  if (parenthetical.some((p) => isGrounded(p, transcriptNorm))) return true;
  const english = englishForTurkish(term);
  if (english && isGrounded(english, transcriptNorm)) return true;
  if (language === "en") return false;
  return parenthetical.length === 0 && !english;
}

export type GroundingResult = { notes: Notes; warnings: string[] };

/** Drop definitions and glossary entries whose English term is not in the transcript. */
export function groundNotes(
  notes: Notes,
  transcript: string,
  opts: { language?: string } = {},
): GroundingResult {
  const norm = normalizeForMatch(transcript);
  const warnings: string[] = [];

  const definitions = notes.definitions.filter((d) => isTermSupported(d.term, norm, opts.language));
  const droppedDefs = notes.definitions.length - definitions.length;
  if (droppedDefs > 0) {
    warnings.push(
      `${droppedDefs} definition${droppedDefs > 1 ? "s" : ""} removed: the term was not found in the transcript.`,
    );
  }

  let glossary = notes.glossary;
  if (glossary) {
    const kept = glossary.filter((g) => isTermSupported(g.term, norm, "en"));
    const dropped = glossary.length - kept.length;
    if (dropped > 0) {
      warnings.push(
        `${dropped} glossary term${dropped > 1 ? "s" : ""} removed: not found in the transcript.`,
      );
    }
    glossary = kept;
  }

  return { notes: { ...notes, definitions, ...(glossary ? { glossary } : {}) }, warnings };
}
