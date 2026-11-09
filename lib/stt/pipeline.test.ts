import { describe, expect, it, vi } from "vitest";
import { WHISPER_SAMPLE_RATE } from "./audio";
import { CancelledError, transcribeSamples } from "./pipeline";

const audible = (seconds: number) => new Float32Array(seconds * WHISPER_SAMPLE_RATE).fill(0.2);
const silent = (seconds: number) => new Float32Array(seconds * WHISPER_SAMPLE_RATE);

function join(...parts: Float32Array[]) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe("transcribeSamples", () => {
  it("creates one timestamped segment per audible part, offset by startSec", async () => {
    const transcribe = vi.fn(async (_a: Float32Array, lang?: string) => ({
      text: ` text-${lang ?? "auto"} `,
      language: "en",
    }));
    const r = await transcribeSamples(join(audible(20), audible(20), audible(5)), {
      startSec: 100,
      language: "auto",
      transcribe,
      partSeconds: 20,
    });
    expect(r.segments).toEqual([
      { start: 100, end: 120, text: "text-auto", language: "en" },
      { start: 120, end: 140, text: "text-auto", language: "en" },
      { start: 140, end: 145, text: "text-auto", language: "en" },
    ]);
    expect(r.durationSec).toBe(45);
    expect(r.silent).toBe(false);
  });

  it("transcribes a recorder overrun with its context instead of inventing a short extra line", async () => {
    const samples = audible(20.64);
    const transcribe = vi.fn(async (audio: Float32Array) => ({
      text: audio.length < WHISPER_SAMPLE_RATE ? "Something." : "The lecture continues.",
      language: "en",
    }));
    const result = await transcribeSamples(samples, {
      startSec: 2162.4,
      language: "en",
      transcribe,
      partSeconds: 20,
    });

    expect(result.segments).toEqual([
      { start: 2162.4, end: 2183.04, text: "The lecture continues.", language: "en" },
    ]);
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcribe.mock.calls[0][0]).toHaveLength(samples.length);
    expect(result.durationSec).toBe(20.64);
  });

  it("keeps timestamps and progress aligned when a later window absorbs the tail", async () => {
    const progress: [number, number][] = [];
    const result = await transcribeSamples(audible(40.64), {
      startSec: 100,
      language: "en",
      transcribe: async () => ({ text: "Speech." }),
      partSeconds: 20,
      onProgress: (done, total) => progress.push([done, total]),
    });

    expect(result.segments).toEqual([
      { start: 100, end: 120, text: "Speech.", language: undefined },
      { start: 120, end: 140.64, text: "Speech.", language: undefined },
    ]);
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(result.durationSec).toBe(40.64);
  });

  it("skips silent parts but keeps the timeline aligned", async () => {
    const transcribe = vi.fn(async () => ({ text: "hi" }));
    const r = await transcribeSamples(join(silent(20), audible(20)), {
      startSec: 0,
      language: "tr",
      transcribe,
      partSeconds: 20,
    });
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcribe).toHaveBeenCalledWith(expect.any(Float32Array), "tr");
    expect(r.segments).toEqual([{ start: 20, end: 40, text: "hi", language: undefined }]);
  });

  it("reports silent when nothing was audible or transcribed", async () => {
    const transcribe = vi.fn(async () => ({ text: "  " }));
    expect(
      (await transcribeSamples(silent(10), { startSec: 0, language: "auto", transcribe })).silent,
    ).toBe(true);
    expect(
      (await transcribeSamples(audible(10), { startSec: 0, language: "auto", transcribe })).silent,
    ).toBe(true);
  });

  it("reports progress and processes parts strictly in order", async () => {
    const order: number[] = [];
    let active = 0;
    const transcribe = vi.fn(async () => {
      active++;
      expect(active).toBe(1);
      order.push(order.length);
      await Promise.resolve();
      active--;
      return { text: "x" };
    });
    const progress: [number, number][] = [];
    await transcribeSamples(audible(60), {
      startSec: 0,
      language: "auto",
      transcribe,
      partSeconds: 20,
      onProgress: (d, t) => progress.push([d, t]),
    });
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("stops with CancelledError as soon as cancellation is requested", async () => {
    let calls = 0;
    const transcribe = vi.fn(async () => {
      calls++;
      return { text: "x" };
    });
    await expect(
      transcribeSamples(audible(60), {
        startSec: 0,
        language: "auto",
        transcribe,
        partSeconds: 20,
        shouldCancel: () => calls >= 1,
      }),
    ).rejects.toBeInstanceOf(CancelledError);
    expect(calls).toBe(1);
  });

  it("propagates transcription failures", async () => {
    const transcribe = vi.fn(async () => {
      throw new Error("model exploded");
    });
    await expect(
      transcribeSamples(audible(5), { startSec: 0, language: "auto", transcribe }),
    ).rejects.toThrow("model exploded");
  });
});
