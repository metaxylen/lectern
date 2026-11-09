import { describe, expect, it } from "vitest";
import { parseLectures } from "./schemas";

const valid = {
  id: "a",
  createdAt: 1,
  title: "T",
  transcript: "x",
  notes: null,
  notesLanguage: "en",
  audioLanguage: "auto",
  sttEngine: "whisper",
  notesEngine: null,
};

describe("parseLectures", () => {
  it("keeps valid lectures and counts dropped ones", () => {
    const result = parseLectures([
      valid,
      { id: "b" },
      null,
      "junk",
      { ...valid, id: "c", createdAt: "x" },
    ]);
    expect(result.lectures.map((l) => l.id)).toEqual(["a"]);
    expect(result.dropped).toBe(4);
  });

  it("returns nothing for non-arrays", () => {
    expect(parseLectures({})).toEqual({ lectures: [], dropped: 0 });
    expect(parseLectures(null)).toEqual({ lectures: [], dropped: 0 });
  });

  it("keeps project names without dropping legacy or malformed optional project data", () => {
    const result = parseLectures([
      valid,
      { ...valid, id: "grouped", project: " Systems " },
      { ...valid, id: "null-project", project: null },
      { ...valid, id: "invalid-project", project: 42 },
    ]);
    expect(result.dropped).toBe(0);
    expect(result.lectures.map((lecture) => lecture.project)).toEqual([
      undefined,
      "Systems",
      undefined,
      undefined,
    ]);
  });

  it("validates nested notes", () => {
    const bad = { ...valid, notes: { title: "t" } };
    expect(parseLectures([bad]).lectures).toHaveLength(0);
  });
});
