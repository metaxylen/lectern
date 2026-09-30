import { describe, expect, it, vi } from "vitest";
import { PcmRing } from "../audio/pcm-buffer";
import { WHISPER_SAMPLE_RATE } from "./audio";
import { LiveTranscriber, type LiveTranscriberOptions } from "./live";

const RATE = WHISPER_SAMPLE_RATE;
const tone = (seconds: number) => new Float32Array(seconds * RATE).fill(0.2);

/** A manual scheduler: tests decide when time passes. */
function manualClock() {
  const tasks: { fn: () => void; ms: number }[] = [];
  return {
    schedule: (fn: () => void, ms: number) => {
      const task = { fn, ms };
      tasks.push(task);
      return () => tasks.splice(tasks.indexOf(task) >>> 0, 1);
    },
    /** Run the next scheduled task and let its async work finish. */
    async fire() {
      const task = tasks.shift();
      task?.fn();
      await vi.waitFor(() => {}, { timeout: 5 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 0));
    },
    get pending() {
      return tasks.length;
    },
  };
}

function setup(over: Partial<LiveTranscriberOptions> = {}) {
  const ring = new PcmRing(RATE, 60);
  const clock = manualClock();
  const updates: { text: string; language?: string }[] = [];
  const transcribe = vi.fn(async (_a: Float32Array, _l?: string) => ({
    text: "hello world",
    language: "en",
  }));
  const live = new LiveTranscriber({
    ring,
    transcribe,
    isBusy: () => false,
    onUpdate: (u) => updates.push(u),
    language: () => "auto",
    schedule: clock.schedule,
    ...over,
  });
  return { ring, clock, updates, transcribe, live };
}

describe("LiveTranscriber", () => {
  it("decodes the audio captured so far and publishes provisional text", async () => {
    const { ring, clock, updates, transcribe, live } = setup();
    live.start();
    ring.push(tone(5));
    await clock.fire();
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcribe.mock.calls[0][0].length).toBe(5 * RATE);
    expect(updates.at(-1)).toEqual({ text: "hello world", language: "en" });
    live.stop();
  });

  it("does nothing until enough audio has arrived, and skips silence", async () => {
    const { ring, clock, transcribe, live } = setup();
    live.start();
    ring.push(tone(1)); // below the 1.5 s minimum
    await clock.fire();
    expect(transcribe).not.toHaveBeenCalled();
    live.newChunk();
    ring.push(new Float32Array(4 * RATE)); // plenty of audio, but silent
    await clock.fire();
    expect(transcribe).not.toHaveBeenCalled();
    live.stop();
  });

  it("decodes at most the chunk length, from the end", async () => {
    const { ring, clock, transcribe, live } = setup();
    live.start();
    ring.push(tone(40));
    await clock.fire();
    expect(transcribe.mock.calls[0][0].length).toBe(20 * RATE);
    live.stop();
  });

  it("lets Whisper detect the language once per chunk, then reuses it", async () => {
    const { ring, clock, transcribe, live } = setup();
    live.start();
    ring.push(tone(4));
    await clock.fire();
    ring.push(tone(2));
    await clock.fire();
    expect(transcribe.mock.calls.map((c) => c[1])).toEqual([undefined, "en"]);
    live.newChunk();
    ring.push(tone(3));
    await clock.fire();
    expect(transcribe.mock.calls[2][1]).toBeUndefined();
    live.stop();
  });

  it("uses a fixed language when one is chosen", async () => {
    const { ring, clock, transcribe, live } = setup({ language: () => "tr" });
    live.start();
    ring.push(tone(4));
    await clock.fire();
    expect(transcribe.mock.calls[0][1]).toBe("tr");
    live.stop();
  });

  it("skips ticks while the model is busy with real work, and keeps going afterwards", async () => {
    let busy = true;
    const { ring, clock, transcribe, live } = setup({ isBusy: () => busy });
    live.start();
    ring.push(tone(4));
    await clock.fire();
    expect(transcribe).not.toHaveBeenCalled();
    expect(clock.pending).toBe(1); // still scheduled
    busy = false;
    await clock.fire();
    expect(transcribe).toHaveBeenCalledTimes(1);
    live.stop();
  });

  it("starts each chunk's window at the chunk boundary and clears the old line", async () => {
    const { ring, clock, updates, transcribe, live } = setup();
    live.start();
    ring.push(tone(10));
    await clock.fire();
    live.newChunk();
    expect(updates.at(-1)).toEqual({ text: "" });
    ring.push(tone(3));
    await clock.fire();
    expect(transcribe.mock.calls[1][0].length).toBe(3 * RATE);
    live.stop();
  });

  it("discards a result that finishes after its chunk already ended", async () => {
    let release!: () => void;
    const slow = vi.fn(
      () =>
        new Promise<{ text: string; language: string }>((resolve) => {
          release = () => resolve({ text: "stale text", language: "en" });
        }),
    );
    const { ring, clock, updates, live } = setup({ transcribe: slow });
    live.start();
    ring.push(tone(4));
    const firing = clock.fire();
    live.newChunk();
    release();
    await firing;
    expect(updates.some((u) => u.text === "stale text")).toBe(false);
    live.stop();
  });

  it("ignores a provisional result that is much shorter than the last one", async () => {
    const replies = [
      "this is a fairly long provisional sentence",
      "uh",
      "this is a fairly long provisional sentence and more",
    ];
    const { ring, clock, updates, live } = setup({
      transcribe: vi.fn(async () => ({ text: replies.shift()!, language: "en" })),
    });
    live.start();
    ring.push(tone(4));
    await clock.fire();
    await clock.fire();
    await clock.fire();
    expect(updates.map((u) => u.text)).toEqual([
      "this is a fairly long provisional sentence",
      "this is a fairly long provisional sentence and more",
    ]);
    live.stop();
  });

  it("removes Whisper hallucinations from live text", async () => {
    const { ring, clock, updates, live } = setup({
      transcribe: vi.fn(async () => ({ text: "Thank you.", language: "en" })),
    });
    live.start();
    ring.push(tone(4));
    await clock.fire();
    expect(updates.filter((u) => u.text)).toEqual([]);
    live.stop();
  });

  it("reports errors, keeps running, and stops cleanly", async () => {
    const onError = vi.fn();
    const { ring, clock, live } = setup({
      transcribe: vi.fn(async () => {
        throw new Error("model exploded");
      }),
      onError,
    });
    live.start();
    ring.push(tone(4));
    await clock.fire();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(clock.pending).toBe(1);
    live.stop();
    expect(clock.pending).toBe(0);
  });
});
