import { describe, expect, it } from "vitest";
import { findHintCandidates, mergeHints, overlap } from "./hints";

const seg = (start: number, text: string) => ({ start, end: start + 20, text });

describe("findHintCandidates", () => {
  it("finds English and Turkish assessment cues and adds the previous segment as context", () => {
    const c = findHintCandidates([
      seg(0, "Semaphores keep a counter."),
      seg(20, "Bunu iyi anlayın, vizede çıkacak."),
      seg(40, "Nothing special here."),
      seg(60, "Homework three is due next Friday."),
      seg(80, "Sınav için ezberlemeniz gerek."),
    ]);
    expect(c).toHaveLength(3);
    expect(c[0].text).toBe("Semaphores keep a counter. Bunu iyi anlayın, vizede çıkacak.");
    expect(c[0].start).toBe(20);
    expect(c[1].text).toContain("Homework three");
  });
  it("finds nothing in neutral speech", () => {
    expect(findHintCandidates([seg(0, "Threads share the heap of a process.")])).toEqual([]);
  });
  it("caps the number of candidates", () => {
    const many = Array.from({ length: 50 }, (_, i) => seg(i * 20, "This is important."));
    expect(findHintCandidates(many, 5)).toHaveLength(5);
  });
  it("tolerates untimed segments", () => {
    const c = findHintCandidates([{ start: NaN, end: NaN, text: "Remember this for the exam." }]);
    expect(c[0].start).toBeUndefined();
  });
});

describe("overlap / mergeHints", () => {
  it("measures shared content words", () => {
    expect(
      overlap("memorize the definition of race condition", "definition of race condition memorize"),
    ).toBe(1);
    expect(overlap("homework due friday", "race condition definition")).toBe(0);
    expect(overlap("", "anything")).toBe(0);
  });
  it("drops near-duplicates and noise but keeps distinct hints in order", () => {
    const merged = mergeHints(
      ["Midterm: memorize the definition of race condition."],
      [
        "Memorize the definition of the race condition for the midterm.",
        "bu önemli",
        "Homework 3 is due next Friday.",
      ],
    );
    expect(merged).toEqual([
      "Midterm: memorize the definition of race condition.",
      "Homework 3 is due next Friday.",
    ]);
  });
});
