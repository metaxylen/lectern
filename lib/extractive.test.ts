import { describe, expect, it } from "vitest";
import {
  condenseTranscript,
  dominantLanguage,
  extractDefinitions,
  extractKeywords,
  extractiveNotes,
  splitSentences,
} from "./extractive";

const EN =
  "A thread is a unit of execution. This is important for the exam. Processes do not share memory by default. Threads inside one process share the same heap.";
const MIXED = `${EN} Bellek, verinin saklandığı alandır. Sınav için önemli bir konu.`;

describe("splitSentences", () => {
  it("splits on sentence boundaries and drops fragments", () => {
    expect(splitSentences("Short. A thread is a unit of execution. Okay.")).toEqual([
      "A thread is a unit of execution.",
    ]);
  });
  it("normalizes whitespace", () => {
    expect(splitSentences("A thread   is a\nunit of execution.")).toEqual([
      "A thread is a unit of execution.",
    ]);
  });
});

describe("dominantLanguage", () => {
  it("detects English and Turkish", () => {
    expect(dominantLanguage("the cat is on the mat and we can see it")).toBe("en");
    expect(dominantLanguage("Bu bir Türkçe cümledir ve çok önemlidir.")).toBe("tr");
  });
});

describe("extractDefinitions", () => {
  it("finds English 'X is a Y' and Turkish 'X, Y'dır' patterns", () => {
    const defs = extractDefinitions(splitSentences(MIXED));
    expect(defs).toContainEqual({ term: "Thread", definition: "Unit of execution" });
    expect(defs.map((d) => d.term)).toContain("Bellek");
  });
  it("respects the max", () => {
    expect(extractDefinitions(splitSentences(MIXED), 1)).toHaveLength(1);
  });
});

describe("extractKeywords", () => {
  it("returns frequent non-stopword terms", () => {
    const kw = extractKeywords(EN, 3);
    expect(kw).toHaveLength(3);
    expect(kw).not.toContain("this");
  });
});

describe("extractiveNotes", () => {
  it("produces complete, well-formed notes", () => {
    const n = extractiveNotes(MIXED);
    expect(n.title).toBeTruthy();
    expect(n.summary).toBeTruthy();
    expect(n.keyPoints.length).toBeGreaterThan(0);
    expect(n.examQuestions.length).toBeGreaterThan(0);
    expect(n.definitions.length).toBeGreaterThan(0);
  });
  it("does not throw on degenerate input", () => {
    expect(() => extractiveNotes("hi")).not.toThrow();
    expect(() => extractiveNotes("")).not.toThrow();
  });
});

describe("condenseTranscript", () => {
  it("returns short text unchanged", () => {
    expect(condenseTranscript("short", 1000)).toBe("short");
  });

  it("stays within budget for long punctuated text", () => {
    const long = Array.from(
      { length: 400 },
      (_, i) => `Sentence number ${i} talks about threads and memory usage.`,
    ).join(" ");
    const out = condenseTranscript(long, 2000);
    expect(out.length).toBeLessThanOrEqual(2000);
    expect(out.length).toBeGreaterThan(0);
  });

  it("never returns empty for long text without sentence punctuation (regression)", () => {
    const noPunctuation = "word ".repeat(5000);
    const out = condenseTranscript(noPunctuation, 1000);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(1000);
  });

  it("keeps both the start and the end when it has to truncate blindly", () => {
    const text = `START ${"filler ".repeat(3000)}END`;
    const out = condenseTranscript(text, 500);
    expect(out.startsWith("START")).toBe(true);
    expect(out.endsWith("END")).toBe(true);
  });
});
