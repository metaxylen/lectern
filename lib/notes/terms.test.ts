import { describe, expect, it } from "vitest";
import { KNOWN_TERM_COUNT, applyKnownGlossary, findKnownTerms, fixGlossary } from "./terms";

describe("findKnownTerms", () => {
  it("finds terms and plurals that occur in the text", () => {
    const found = findKnownTerms(
      "Two threads cause a race condition. We use a semaphore and avoid deadlocks.",
    );
    const en = found.map((t) => t.en);
    expect(en).toEqual(
      expect.arrayContaining(["thread", "race condition", "semaphore", "deadlock"]),
    );
    expect(found.find((t) => t.en === "deadlock")?.tr).toBe("kilitlenme");
  });
  it("does not match inside other words", () => {
    expect(findKnownTerms("The treehouse is nice").map((t) => t.en)).not.toContain("tree");
    expect(findKnownTerms("arrayed and cached").map((t) => t.en)).toEqual([]);
  });
  it("prefers the longer term over one it contains", () => {
    const en = findKnownTerms("The time complexity is linear.").map((t) => t.en);
    expect(en).toContain("time complexity");
    expect(en).not.toContain("complexity");
  });
  it("respects the max", () => {
    const text = "thread process deadlock semaphore mutex kernel cache heap stack";
    expect(findKnownTerms(text, 3)).toHaveLength(3);
  });
  it("returns nothing for unrelated text", () => {
    expect(findKnownTerms("We baked a cake today.")).toEqual([]);
  });
});

describe("fixGlossary / applyKnownGlossary", () => {
  it("replaces invented translations with established ones, case-insensitively and for plurals", () => {
    const out = fixGlossary([
      { term: "Race Condition", turkish: "yüzleşme koşulu" },
      { term: "threads", turkish: "iplikler" },
      { term: "Dijkstra", turkish: "Dijkstra" },
    ]);
    expect(out).toEqual([
      { term: "Race Condition", turkish: "yarış durumu" },
      { term: "threads", turkish: "iş parçacığı" },
      { term: "Dijkstra", turkish: "Dijkstra" },
    ]);
  });
  it("leaves notes without a glossary alone", () => {
    const notes = {
      title: "t",
      summary: "s",
      keyPoints: ["k"],
      definitions: [],
      examQuestions: [],
    };
    expect(applyKnownGlossary(notes)).toBe(notes);
    expect(fixGlossary(undefined)).toBeUndefined();
  });
  it("ships a meaningful dictionary", () => {
    expect(KNOWN_TERM_COUNT).toBeGreaterThan(100);
  });
});

describe("englishForTurkish", () => {
  it("maps dictionary Turkish wording back to English", async () => {
    const { englishForTurkish } = await import("./terms");
    expect(englishForTurkish("Yarış durumu")).toBe("race condition");
    expect(englishForTurkish("kilitlenme (deadlock)")).toBe("deadlock");
    expect(englishForTurkish("iş parçacığı")).toBe("thread");
    expect(englishForTurkish("uydurma terim")).toBeUndefined();
    expect(englishForTurkish("")).toBeUndefined();
  });
});
