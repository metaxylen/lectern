import { describe, expect, it } from "vitest";
import { normalizeNotes, parseJson } from "./normalize";

const good = {
  title: " Title ",
  summary: "Sum",
  keyPoints: ["a", " ", "b"],
  definitions: [{ term: "x", definition: "y" }, { term: "", definition: "dropped" }, "garbage"],
  examQuestions: [{ question: "q?", answer: "a" }, { question: "" }],
};

describe("normalizeNotes", () => {
  it("trims, drops empties and non-objects", () => {
    const n = normalizeNotes(good);
    expect(n.title).toBe("Title");
    expect(n.keyPoints).toEqual(["a", "b"]);
    expect(n.definitions).toEqual([{ term: "x", definition: "y" }]);
    expect(n.examQuestions).toEqual([{ question: "q?", answer: "a" }]);
    expect(n.glossary).toBeUndefined();
  });

  it("keeps a cleaned glossary when provided", () => {
    const n = normalizeNotes({
      ...good,
      glossary: [{ term: "t", turkish: "tr" }, { term: "only" }],
    });
    expect(n.glossary).toEqual([{ term: "t", turkish: "tr" }]);
  });

  it.each([null, undefined, "str", 42, {}, { ...good, title: "" }, { ...good, keyPoints: [] }])(
    "rejects unusable output %j",
    (bad) => {
      expect(() => normalizeNotes(bad)).toThrow(/incomplete/);
    },
  );
});

describe("parseJson", () => {
  it("parses plain, fenced and prose-wrapped JSON", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJson('Sure! Here you go: {"a":1} Hope that helps')).toEqual({ a: 1 });
  });

  it("throws a clear error on garbage, including broken braces", () => {
    expect(() => parseJson("no json")).toThrow("Model did not return valid JSON");
    expect(() => parseJson("{ not: valid }")).toThrow("Model did not return valid JSON");
  });
});

describe("normalizeNotes: extended fields", () => {
  const base = {
    title: "T",
    summary: "S",
    keyPoints: ["a", "A.", "b"],
    definitions: [],
    examQuestions: [],
  };

  it("parses sections with m:ss and numeric starts, dropping untitled ones", () => {
    const n = normalizeNotes({
      ...base,
      sections: [
        { title: "One", summary: "s", start: "1:15" },
        { title: "Two", summary: "s", start: 200 },
        { title: "", summary: "dropped" },
        { title: "No time", summary: "s", start: "soon" },
      ],
    });
    expect(n.sections).toEqual([
      { title: "One", summary: "s", start: 75 },
      { title: "Two", summary: "s", start: 200 },
      { title: "No time", summary: "s" },
    ]);
  });

  it("keeps flashcards and exam hints, deduplicating near-identical entries", () => {
    const n = normalizeNotes({
      ...base,
      flashcards: [
        { front: "Mutex?", back: "A lock" },
        { front: "mutex", back: "dup" },
        { front: "x", back: "" },
      ],
      examHints: ["Midterm: race conditions.", "midterm race conditions", "  "],
    });
    expect(n.flashcards).toEqual([{ front: "Mutex?", back: "A lock" }]);
    expect(n.examHints).toEqual(["Midterm: race conditions."]);
  });

  it("deduplicates key points that differ only in punctuation and case", () => {
    expect(normalizeNotes(base).keyPoints).toEqual(["a", "b"]);
  });

  it("enforces list caps", () => {
    const many = Array.from({ length: 50 }, (_, i) => `point number ${i}`);
    expect(normalizeNotes({ ...base, keyPoints: many }).keyPoints).toHaveLength(14);
  });

  it("omits empty optional fields", () => {
    const n = normalizeNotes({ ...base, sections: [], flashcards: [], examHints: [] });
    expect(n.sections).toBeUndefined();
    expect(n.flashcards).toBeUndefined();
    expect(n.examHints).toBeUndefined();
  });
});
