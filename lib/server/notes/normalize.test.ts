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
