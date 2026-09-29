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

  it("validates nested notes", () => {
    const bad = { ...valid, notes: { title: "t" } };
    expect(parseLectures([bad]).lectures).toHaveLength(0);
  });
});
