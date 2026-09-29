import { describe, expect, it } from "vitest";
import {
  findSegmentIndex,
  formatTimestamp,
  joinSegments,
  segmentsToTimestampedText,
  sortSegments,
} from "./segments";
import type { Segment } from "./types";

const segs: Segment[] = [
  { start: 0, end: 20, text: "Hello there.", language: "en" },
  { start: 20, end: 40, text: " Merhaba. ", language: "tr" },
  { start: 40, end: 60, text: "   " },
  { start: 3700, end: 3720, text: "Later." },
];

describe("formatTimestamp", () => {
  it.each([
    [0, "0:00"],
    [9, "0:09"],
    [75, "1:15"],
    [3599, "59:59"],
    [3725, "1:02:05"],
    [-3, "0:00"],
    [61.9, "1:01"],
  ])("%d -> %s", (input, expected) => expect(formatTimestamp(input)).toBe(expected));
});

describe("joinSegments", () => {
  it("joins trimmed non-empty text with spaces", () => {
    expect(joinSegments(segs)).toBe("Hello there. Merhaba. Later.");
  });
  it("is empty for no segments", () => expect(joinSegments([])).toBe(""));
});

describe("segmentsToTimestampedText", () => {
  it("prefixes each non-empty segment with its start time", () => {
    expect(segmentsToTimestampedText(segs)).toBe(
      "[0:00] Hello there.\n[0:20] Merhaba.\n[1:01:40] Later.",
    );
  });
});

describe("findSegmentIndex", () => {
  it("returns the segment being spoken", () => {
    expect(findSegmentIndex(segs, 0)).toBe(0);
    expect(findSegmentIndex(segs, 19.9)).toBe(0);
    expect(findSegmentIndex(segs, 20)).toBe(1);
    expect(findSegmentIndex(segs, 5000)).toBe(3);
  });
  it("returns -1 before the first segment or with none", () => {
    expect(findSegmentIndex([{ start: 5, end: 9, text: "x" }], 1)).toBe(-1);
    expect(findSegmentIndex([], 10)).toBe(-1);
  });
});

describe("sortSegments", () => {
  it("orders by start without mutating the input", () => {
    const input: Segment[] = [
      { start: 20, end: 30, text: "b" },
      { start: 0, end: 10, text: "a" },
    ];
    expect(sortSegments(input).map((s) => s.text)).toEqual(["a", "b"]);
    expect(input[0].text).toBe("b");
  });
});
