import type { Notes } from "../../types";

type Rec = Record<string, unknown>;

const str = (v: unknown) => String(v ?? "").trim();

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : [];
}

function asRecords(v: unknown): Rec[] {
  return Array.isArray(v) ? v.filter((x): x is Rec => typeof x === "object" && x !== null) : [];
}

/** Coerce whatever a model returned into a valid Notes object, or throw if it is unusable. */
export function normalizeNotes(raw: unknown): Notes {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Rec;
  const notes: Notes = {
    title: str(obj.title),
    summary: str(obj.summary),
    keyPoints: asStringArray(obj.keyPoints),
    definitions: asRecords(obj.definitions)
      .map((d) => ({ term: str(d.term), definition: str(d.definition) }))
      .filter((d) => d.term && d.definition),
    examQuestions: asRecords(obj.examQuestions)
      .map((q) => ({ question: str(q.question), answer: str(q.answer) }))
      .filter((q) => q.question),
  };
  if (Array.isArray(obj.glossary)) {
    notes.glossary = asRecords(obj.glossary)
      .map((g) => ({ term: str(g.term), turkish: str(g.turkish) }))
      .filter((g) => g.term && g.turkish);
  }
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
