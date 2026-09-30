import { dominantLanguage, extractKeywords, extractiveNotes, splitSentences } from "../extractive";
import type { Flashcard, Notes, Section, Segment } from "../types";
import { chunkSegments } from "./chunk";

/** Sentences where a lecturer talks about assessment or tells students what to remember. */
const EXAM_HINT =
  /\b(?:exams?|midterms?|finals?|quiz(?:zes)?|homeworks?|assignments?|deadlines?|will be (?:on|in) the|remember|memori[sz]e)\b|sınav|vize|ödev|çıkacak|çıkar\b|çıkabilir|ezberle|unutmay|mutlaka|dikkat/iu;

export function extractExamHints(text: string, max = 8): string[] {
  return splitSentences(text)
    .filter((s) => EXAM_HINT.test(s))
    .slice(0, max);
}

export function flashcardsFromDefinitions(notes: Notes, max = 12): Flashcard[] {
  const tr = dominantLanguage(`${notes.summary} ${notes.keyPoints.join(" ")}`) === "tr";
  return notes.definitions.slice(0, max).map((d) => ({
    front: tr ? `${d.term} nedir?` : `What is ${d.term}?`,
    back: d.definition,
  }));
}

/** Split a timestamped lecture into a few equal-length chapters named after their top keywords. */
export function offlineSections(segments: Segment[], maxSections = 6): Section[] | undefined {
  const timed = segments.length > 0 && segments.every((s) => Number.isFinite(s.start));
  if (!timed) return undefined;
  const total = segments.reduce((n, s) => n + s.text.length, 0);
  if (total < 1500) return undefined;
  const chunks = chunkSegments(
    segments,
    Math.ceil(total / Math.min(maxSections, Math.ceil(total / 1500))),
  );
  return chunks.map((c, i) => {
    const keywords = extractKeywords(c.text, 3);
    const first = splitSentences(c.text)[0] ?? c.text.slice(0, 160);
    const cap = (w: string) => w.charAt(0).toLocaleUpperCase() + w.slice(1);
    return {
      title: keywords.length ? keywords.map(cap).join(", ") : `Part ${i + 1}`,
      summary: first,
      ...(c.start !== undefined ? { start: Math.floor(c.start) } : {}),
    };
  });
}

/** The zero-setup engine, extended with exam hints, flashcards and chapters. */
export function offlineNotes(plain: string, segments: Segment[] = []): Notes {
  const notes = extractiveNotes(plain);
  const examHints = extractExamHints(plain);
  const flashcards = flashcardsFromDefinitions(notes);
  const sections = offlineSections(segments);
  return {
    ...notes,
    ...(examHints.length ? { examHints } : {}),
    ...(flashcards.length ? { flashcards } : {}),
    ...(sections?.length ? { sections } : {}),
  };
}
