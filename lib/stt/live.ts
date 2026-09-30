import type { PcmRing } from "../audio/pcm-buffer";
import { cleanText } from "../notes/clean";
import { WHISPER_SAMPLE_RATE, isMostlySilent } from "./audio";
import type { TranscribeFn } from "./pipeline";

export type LiveUpdate = { text: string; language?: string };

export type LiveTranscriberOptions = {
  ring: PcmRing;
  transcribe: TranscribeFn;
  /** True while the model cannot take a live request (still loading, or final chunks are queued). */
  isBusy: () => boolean;
  onUpdate: (update: LiveUpdate) => void;
  /** "auto" lets Whisper pick the language on the first tick of each chunk, then reuses it. */
  language: () => string;
  /** Pause between the end of one live decode and the start of the next. */
  intervalMs?: number;
  /** Longest stretch of audio decoded per tick: the chunk length, so live text ends where final text begins. */
  maxSeconds?: number;
  /** Do not decode less audio than this; very short clips make Whisper invent words. */
  minSeconds?: number;
  onError?: (err: unknown) => void;
  schedule?: (fn: () => void, ms: number) => () => void;
};

const defaultSchedule = (fn: () => void, ms: number) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/**
 * Near-real-time transcript of the chunk being recorded. Every few seconds it decodes the audio
 * captured since the current chunk began and shows the result as a provisional line; when the chunk
 * is finished the authoritative transcription takes over (`newChunk`). Decoding never queues up:
 * the next tick starts only after the previous one finished, and it is skipped while the model is
 * busy with real work, so live text can lag but can never slow the final result down.
 */
export class LiveTranscriber {
  private readonly o: Required<
    Pick<LiveTranscriberOptions, "intervalMs" | "maxSeconds" | "minSeconds" | "schedule">
  > &
    LiveTranscriberOptions;
  private running = false;
  private cancel: (() => void) | null = null;
  private chunkStart = 0;
  private epoch = 0;
  private shown = "";
  private language: string | undefined;

  constructor(options: LiveTranscriberOptions) {
    this.o = {
      intervalMs: 2500,
      maxSeconds: 20,
      minSeconds: 1.5,
      schedule: defaultSchedule,
      ...options,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.chunkStart = this.o.ring.position;
    this.queue();
  }

  stop() {
    this.running = false;
    this.epoch++;
    this.cancel?.();
    this.cancel = null;
    this.shown = "";
  }

  /** The recorder finished a chunk: live text for it is obsolete, start over from "now". */
  newChunk() {
    this.epoch++;
    this.chunkStart = this.o.ring.position;
    this.shown = "";
    this.language = undefined;
    this.o.onUpdate({ text: "" });
  }

  private queue(delay = this.o.intervalMs) {
    if (!this.running) return;
    this.cancel = this.o.schedule(() => void this.tick(), delay);
  }

  private async tick() {
    if (!this.running) return;
    const epoch = this.epoch;
    try {
      if (this.o.isBusy()) return;
      const available = this.o.ring.position - this.chunkStart; // samples since the chunk began
      const wanted = Math.min(available, Math.floor(this.o.maxSeconds * WHISPER_SAMPLE_RATE));
      const samples = this.o.ring.since(this.o.ring.position - wanted);
      if (samples.length < this.o.minSeconds * WHISPER_SAMPLE_RATE || isMostlySilent(samples))
        return;

      const requested = this.o.language();
      const language = requested === "auto" ? this.language : requested;
      const result = await this.o.transcribe(samples, language);
      if (epoch !== this.epoch || !this.running) return; // the chunk ended meanwhile
      if (requested === "auto" && result.language) this.language = result.language;

      const text = cleanText(result.text).text;
      if (!text) return;
      // A decode that suddenly says much less than before is almost always a bad one: keep the old line.
      if (this.shown && text.length < this.shown.length * 0.6) return;
      this.shown = text;
      this.o.onUpdate({ text, language: result.language ?? language });
    } catch (err) {
      this.o.onError?.(err);
    } finally {
      this.queue();
    }
  }
}
