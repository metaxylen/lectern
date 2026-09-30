import { describe, expect, it } from "vitest";
import { flashcardsToAnkiTsv } from "./anki";

describe("flashcardsToAnkiTsv", () => {
  it("writes one tab-separated line per card", () => {
    expect(
      flashcardsToAnkiTsv([
        { front: "Mutex?", back: "A lock" },
        { front: "TLB", back: "Cache of page table entries" },
      ]),
    ).toBe("Mutex?\tA lock\nTLB\tCache of page table entries");
  });
  it("protects the format from tabs and newlines inside cards", () => {
    expect(flashcardsToAnkiTsv([{ front: "a\tb", back: "line1\nline2" }])).toBe(
      "a b\tline1<br>line2",
    );
  });
  it("skips empty cards and handles none", () => {
    expect(flashcardsToAnkiTsv([{ front: " ", back: "x" }])).toBe("");
    expect(flashcardsToAnkiTsv([])).toBe("");
  });
});
