import { parseTimestamp } from "../../notes/chunk";
import { normalizeForMatch } from "../../notes/ground";
import type { Notes } from "../../types";

type Rec = Record<string, unknown>;

/** Generous caps: a model that rambles should not flood the UI. */
export const LIMITS = {
  keyPoints: 14,
  definitions: 16,
  examQuestions: 10,
  flashcards: 24,
  sections: 12,
  examHints: 12,
  glossary: 16,
} as const;

const str = (v: unknown) => String(v ?? "").trim();

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : [];
}

function asRecords(v: unknown): Rec[] {
  return Array.isArray(v) ? v.filter((x): x is Rec => typeof x === "object" && x !== null) : [];
}

/** Remove entries that say the same thing (compared ignoring case, punctuation and accents). */
export function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = normalizeForMatch(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function dedupeBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = normalizeForMatch(key(item));
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Coerce whatever a model returned into a valid Notes object, or throw if it is unusable. */
export function normalizeNotes(raw: unknown): Notes {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Rec;
  const notes: Notes = {
    title: str(obj.title),
    summary: str(obj.summary),
    keyPoints: dedupeStrings(asStringArray(obj.keyPoints)).slice(0, LIMITS.keyPoints),
    definitions: dedupeBy(
      asRecords(obj.definitions)
        .map((d) => ({ term: str(d.term), definition: str(d.definition) }))
        .filter((d) => d.term && d.definition),
      (d) => d.term,
    ).slice(0, LIMITS.definitions),
    examQuestions: dedupeBy(
      asRecords(obj.examQuestions)
        .map((q) => ({ question: str(q.question), answer: str(q.answer) }))
        .filter((q) => q.question),
      (q) => q.question,
    ).slice(0, LIMITS.examQuestions),
  };

  if (Array.isArray(obj.glossary)) {
    notes.glossary = dedupeBy(
      asRecords(obj.glossary)
        .map((g) => ({ term: str(g.term), turkish: str(g.turkish) }))
        .filter((g) => g.term && g.turkish),
      (g) => g.term,
    ).slice(0, LIMITS.glossary);
  }

  const sections = asRecords(obj.sections)
    .map((s) => {
      const start = parseTimestamp(s.start);
      return {
        title: str(s.title),
        summary: str(s.summary),
        ...(start !== undefined ? { start } : {}),
      };
    })
    .filter((s) => s.title)
    .slice(0, LIMITS.sections);
  if (sections.length) notes.sections = sections;

  const flashcards = dedupeBy(
    asRecords(obj.flashcards)
      .map((f) => ({ front: str(f.front), back: str(f.back) }))
      .filter((f) => f.front && f.back),
    (f) => f.front,
  ).slice(0, LIMITS.flashcards);
  if (flashcards.length) notes.flashcards = flashcards;

  const examHints = dedupeStrings(asStringArray(obj.examHints)).slice(0, LIMITS.examHints);
  if (examHints.length) notes.examHints = examHints;

  if (!notes.title || !notes.summary || !notes.keyPoints.length) {
    throw new Error("Model returned incomplete notes JSON");
  }
  return notes;
}

/** Parse JSON that may be wrapped in a markdown fence or surrounded by prose. */
export function parseJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new Error("Model did not return valid JSON");
  }
}
