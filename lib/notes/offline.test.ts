import { describe, expect, it } from "vitest";
import {
  extractExamHints,
  flashcardsFromDefinitions,
  offlineNotes,
  offlineSections,
} from "./offline";

const seg = (start: number, text: string) => ({ start, end: start + 20, text });

describe("extractExamHints", () => {
  it("picks sentences about assessment in English and Turkish", () => {
    const hints = extractExamHints(
      "A thread is a unit of execution. This will be on the exam for sure. Bunu vizede mutlaka soracağım. Homework three is due Friday.",
    );
    expect(hints).toHaveLength(3);
  });
  it("returns nothing for neutral text", () => {
    expect(extractExamHints("Threads share the heap of a process. Stacks are private.")).toEqual(
      [],
    );
  });
});

describe("flashcardsFromDefinitions", () => {
  const notes = (summary: string) => ({
    title: "t",
    summary,
    keyPoints: [],
    definitions: [{ term: "Thread", definition: "A unit of execution" }],
    examQuestions: [],
  });
  it("creates a card per definition, in the transcript language", () => {
    expect(
      flashcardsFromDefinitions(notes("the thread is a unit of the process and we can see it")),
    ).toEqual([{ front: "What is Thread?", back: "A unit of execution" }]);
    expect(flashcardsFromDefinitions(notes("Bu bir Türkçe özet ve çok önemlidir."))[0].front).toBe(
      "Thread nedir?",
    );
  });
});

describe("offlineSections", () => {
  it("needs timestamps and enough text", () => {
    expect(offlineSections([{ start: NaN, end: NaN, text: "x".repeat(5000) }])).toBeUndefined();
    expect(offlineSections([seg(0, "short text")])).toBeUndefined();
  });
  it("splits a long timed lecture into ordered chapters with start times", () => {
    const segs = Array.from({ length: 40 }, (_, i) =>
      seg(i * 20, `Sentence ${i} talks about memory pages and scheduling of threads in detail.`),
    );
    const sections = offlineSections(segs) ?? [];
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.length).toBeLessThanOrEqual(6);
    expect(sections[0].start).toBe(0);
    const starts = sections.map((s) => s.start!);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe("offlineNotes", () => {
  it("adds hints and flashcards on top of the base summary", () => {
    const text =
      "A thread is a unit of execution. Threads share the heap of the process. This is important for the exam. Processes do not share memory by default.";
    const notes = offlineNotes(text);
    expect(notes.keyPoints.length).toBeGreaterThan(0);
    expect(notes.examHints?.length).toBeGreaterThan(0);
    expect(notes.flashcards?.length).toBeGreaterThan(0);
  });
});
