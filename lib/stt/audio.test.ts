import { describe, expect, it } from "vitest";
import { WHISPER_SAMPLE_RATE, isMostlySilent, splitAudio } from "./audio";

const seconds = (n: number, value = 0) => new Float32Array(n * WHISPER_SAMPLE_RATE).fill(value);

describe("splitAudio", () => {
  it("splits into fixed windows with a shorter remainder", () => {
    const parts = splitAudio(seconds(50), 20);
    expect(parts.map((p) => p.length / WHISPER_SAMPLE_RATE)).toEqual([20, 20, 10]);
  });

  it.each([
    [20.64, [20.64]],
    [40.64, [20, 20.64]],
    [44.99, [20, 24.99]],
    [45, [20, 20, 5]],
  ])("keeps a short tail with its preceding window for %s seconds", (duration, expected) => {
    const source = seconds(duration, 0.2);
    source[source.length - 1] = 0.7;
    const parts = splitAudio(source, 20);
    expect(parts.map((p) => p.length / WHISPER_SAMPLE_RATE)).toEqual(expected);
    expect(parts.reduce((total, p) => total + p.length, 0)).toBe(source.length);
    expect(parts.at(-1)?.at(-1)).toBe(source.at(-1));
  });

  it("returns one part for short audio and none for empty audio", () => {
    expect(splitAudio(seconds(5), 20)).toHaveLength(1);
    expect(splitAudio(new Float32Array(0), 20)).toHaveLength(0);
  });

  it("does not alias the source buffer", () => {
    const src = seconds(2, 0.5);
    const [part] = splitAudio(src, 1);
    part[0] = 0;
    expect(src[0]).toBe(0.5);
  });
});

describe("isMostlySilent", () => {
  it("treats very short clips as silent", () => {
    expect(isMostlySilent(seconds(0.2, 0.5))).toBe(true);
  });
  it("detects digital silence and low noise", () => {
    expect(isMostlySilent(seconds(2, 0))).toBe(true);
    expect(isMostlySilent(seconds(2, 0.001))).toBe(true);
  });
  it("accepts audible signal", () => {
    expect(isMostlySilent(seconds(2, 0.1))).toBe(false);
  });
});
