import { describe, expect, it } from "vitest";
import { PcmRing } from "./pcm-buffer";

const ramp = (from: number, n: number) => Float32Array.from({ length: n }, (_, i) => from + i);

describe("PcmRing", () => {
  it("returns what was written, in order, before it wraps", () => {
    const ring = new PcmRing(10, 1); // 10 samples
    ring.push(ramp(0, 4));
    ring.push(ramp(4, 3));
    expect(ring.position).toBe(7);
    expect([...ring.since(0)]).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([...ring.since(5)]).toEqual([5, 6]);
  });

  it("keeps only the newest samples once full", () => {
    const ring = new PcmRing(10, 1);
    ring.push(ramp(0, 8));
    ring.push(ramp(8, 6)); // 14 written, ring holds the last 10
    expect([...ring.since(0)]).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect([...ring.since(11)]).toEqual([11, 12, 13]);
  });

  it("handles a single push larger than the ring", () => {
    const ring = new PcmRing(4, 1);
    ring.push(ramp(0, 10));
    expect(ring.position).toBe(10);
    expect([...ring.since(0)]).toEqual([6, 7, 8, 9]);
  });

  it("recent() returns the last N seconds", () => {
    const ring = new PcmRing(10, 5);
    ring.push(ramp(0, 35));
    expect([...ring.recent(2)]).toEqual(Array.from({ length: 20 }, (_, i) => 15 + i));
    expect(ring.recent(0)).toHaveLength(0);
  });

  it("returns an empty array when nothing new arrived", () => {
    const ring = new PcmRing(10, 1);
    ring.push(ramp(0, 3));
    expect(ring.since(3)).toHaveLength(0);
    expect(ring.since(99)).toHaveLength(0);
  });
});
