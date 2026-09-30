import { describe, expect, it } from "vitest";
import { generateNotes } from "../lib/server/notes";
import { resetEnvCache } from "../lib/server/env";
import type { Notes, NotesEngineChoice } from "../lib/types";
import { FIXTURES, type Fixture } from "./fixtures";

const ENGINE = (process.env.EVAL_ENGINE ?? "ollama") as NotesEngineChoice;
const ONLY = process.env.EVAL_ONLY; // substring of a fixture name

/** All text the notes contain, for concept matching. */
function haystack(n: Notes): string {
  return [
    n.title,
    n.summary,
    ...n.keyPoints,
    ...n.definitions.flatMap((d) => [d.term, d.definition]),
    ...n.examQuestions.flatMap((q) => [q.question, q.answer]),
    ...(n.examHints ?? []),
    ...(n.flashcards ?? []).flatMap((f) => [f.front, f.back]),
    ...(n.sections ?? []).flatMap((s) => [s.title, s.summary]),
  ].join("\n");
}

type Score = {
  name: string;
  engine: string;
  model?: string;
  seconds: number;
  conceptCoverage: number;
  hintCoverage: number;
  forbiddenHits: string[];
  hasSections: boolean;
  counts: Record<string, number>;
  warnings: string[];
};

async function evaluate(f: Fixture): Promise<{ score: Score; notes: Notes }> {
  resetEnvCache();
  const transcript = f.segments.map((s) => s.text).join(" ");
  const progress: string[] = [];
  const result = await generateNotes(
    {
      transcript,
      segments: f.segments,
      language: f.language,
      glossary: !!f.glossary,
      context: f.context,
    },
    ENGINE,
    { onProgress: (p) => progress.push(p.message) },
  );
  const all = haystack(result.notes);
  const concepts = f.expect.concepts.filter((alts) => alts.some((re) => re.test(all))).length;
  const hintsText = (result.notes.examHints ?? []).join("\n");
  const hints = f.expect.hints.filter((re) => re.test(hintsText)).length;
  const score: Score = {
    name: f.name,
    engine: result.engine,
    model: result.model,
    seconds: Math.round((result.elapsedMs ?? 0) / 100) / 10,
    conceptCoverage: concepts / f.expect.concepts.length,
    hintCoverage: f.expect.hints.length ? hints / f.expect.hints.length : 1,
    forbiddenHits: f.expect.forbidden.filter((re) => re.test(all)).map(String),
    hasSections: !!result.notes.sections?.length,
    counts: {
      keyPoints: result.notes.keyPoints.length,
      definitions: result.notes.definitions.length,
      examQuestions: result.notes.examQuestions.length,
      examHints: result.notes.examHints?.length ?? 0,
      flashcards: result.notes.flashcards?.length ?? 0,
      sections: result.notes.sections?.length ?? 0,
    },
    warnings: result.warnings ?? [],
  };
  return { score, notes: result.notes };
}

describe.each(FIXTURES.filter((f) => !ONLY || f.name.toLowerCase().includes(ONLY.toLowerCase())))(
  "notes quality: $name",
  (fixture) => {
    it(`engine ${ENGINE}`, async () => {
      const { score, notes } = await evaluate(fixture);
      console.log("\n=== SCORE ===\n" + JSON.stringify(score, null, 2));
      if (process.env.EVAL_SHOW) console.log("\n=== NOTES ===\n" + JSON.stringify(notes, null, 2));

      expect(
        score.forbiddenHits,
        "notes contain transcript junk or uncorrected ASR errors",
      ).toEqual([]);
      expect(score.conceptCoverage, "covers the lecture's main concepts").toBeGreaterThanOrEqual(
        0.66,
      );
      expect(
        score.hintCoverage,
        "captures what the lecturer said about exams/homework",
      ).toBeGreaterThanOrEqual(0.5);
      expect(score.counts.keyPoints).toBeGreaterThanOrEqual(5);
      expect(score.counts.examQuestions).toBeGreaterThanOrEqual(4);
      if (fixture.expect.sections) expect(score.hasSections).toBe(true);
    });
  },
);
