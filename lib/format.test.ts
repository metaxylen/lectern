import { describe, expect, it } from "vitest";
import { formatDate, mmss } from "./format";

describe("mmss", () => {
  it.each([
    [0, "00:00"],
    [5, "00:05"],
    [75, "01:15"],
    [3599, "59:59"],
    [3600, "60:00"],
  ])("formats %d seconds as %s", (input, expected) => {
    expect(mmss(input)).toBe(expected);
  });

  it("clamps negatives and floors fractions", () => {
    expect(mmss(-4)).toBe("00:00");
    expect(mmss(61.9)).toBe("01:01");
  });
});

describe("formatDate", () => {
  it("returns a non-empty localized string", () => {
    expect(formatDate(Date.UTC(2026, 8, 29, 9, 0))).toMatch(/2026/);
  });
});
