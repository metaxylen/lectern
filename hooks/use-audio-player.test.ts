import { describe, expect, it } from "vitest";
import { trackAt } from "./use-audio-player";

const tracks = [
  { start: 0, duration: 20 },
  { start: 20, duration: 20 },
  { start: 40, duration: 5 },
];

describe("trackAt", () => {
  it("finds the track containing a time", () => {
    expect(trackAt(tracks, 0)).toBe(0);
    expect(trackAt(tracks, 19.9)).toBe(0);
    expect(trackAt(tracks, 20)).toBe(1);
    expect(trackAt(tracks, 44)).toBe(2);
  });
  it("clamps out-of-range times", () => {
    expect(trackAt(tracks, -5)).toBe(0);
    expect(trackAt(tracks, 9999)).toBe(2);
  });
  it("returns -1 with no tracks", () => {
    expect(trackAt([], 3)).toBe(-1);
  });
});
