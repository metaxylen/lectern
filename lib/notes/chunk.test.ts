import { describe, expect, it } from "vitest";
import { chunkSegments, parseTimestamp, renderWithTimestamps, textToSegments } from "./chunk";

const seg = (start: number, text: string) => ({ start, end: start + 20, text });

describe("chunkSegments", () => {
  it("packs whole segments up to the budget and keeps time ranges", () => {
    const segs = [seg(0, "a".repeat(40)), seg(20, "b".repeat(40)), seg(40, "c".repeat(40))];
    const chunks = chunkSegments(segs, 90);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ start: 0, end: 40 });
    expect(chunks[1]).toMatchObject({ start: 40, end: 60 });
    expect(chunks.map((c) => c.text).join(" ")).toBe(segs.map((s) => s.text).join(" "));
  });

  it("never loses text, even when one segment exceeds the budget", () => {
    const long =
      "Sentence number one is here. Sentence number two is here. Sentence number three is here.";
    const chunks = chunkSegments([seg(0, long)], 40);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(40);
    expect(chunks.map((c) => c.text).join(" ")).toContain("Sentence number three");
  });

  it("hard-splits text that has no sentence boundaries", () => {
    const chunks = chunkSegments([seg(0, "word ".repeat(100).trim())], 50);
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(50);
  });

  it("returns nothing for no segments", () => {
    expect(chunkSegments([], 100)).toEqual([]);
  });

  it("leaves times undefined for untimed text", () => {
    const chunks = chunkSegments(
      textToSegments("A thread is a unit of execution. Another sentence follows here."),
      1000,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].start).toBeUndefined();
  });
});

describe("textToSegments", () => {
  it("handles empty and unsplittable text", () => {
    expect(textToSegments("   ")).toEqual([]);
    expect(textToSegments("short")).toHaveLength(1);
  });
});

describe("renderWithTimestamps / parseTimestamp", () => {
  it("round-trips markers", () => {
    const out = renderWithTimestamps([seg(0, "one"), seg(75, "two"), seg(3725, "three")]);
    expect(out).toBe("[0:00] one\n[1:15] two\n[62:05] three");
    expect(parseTimestamp("[1:15]")).toBe(75);
    expect(parseTimestamp("62:05")).toBe(3725);
    expect(parseTimestamp("1:02:05")).toBe(3725);
  });
  it("accepts numbers and rejects junk", () => {
    expect(parseTimestamp(90.7)).toBe(90);
    expect(parseTimestamp("90")).toBe(90);
    expect(parseTimestamp("soon")).toBeUndefined();
    expect(parseTimestamp(-4)).toBeUndefined();
    expect(parseTimestamp(null)).toBeUndefined();
  });
  it("omits markers for untimed segments", () => {
    expect(renderWithTimestamps(textToSegments("Only text here, no times at all."))).toBe(
      "Only text here, no times at all.",
    );
  });
});
