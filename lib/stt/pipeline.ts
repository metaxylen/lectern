import type { Segment } from "../types";
import { CHUNK_SECONDS, WHISPER_SAMPLE_RATE, isMostlySilent, splitAudio } from "./audio";

export type TranscribeFn = (
  audio: Float32Array,
  language?: string,
) => Promise<{ text: string; language?: string }>;

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

export type TranscribeSamplesOptions = {
  /** Where these samples begin on the lecture timeline (seconds). */
  startSec: number;
  /** "auto" lets Whisper pick per part; otherwise a language code. */
  language: string;
  transcribe: TranscribeFn;
  partSeconds?: number;
  onProgress?: (done: number, total: number) => void;
  shouldCancel?: () => boolean;
};

export type TranscribeSamplesResult = {
  segments: Segment[];
  durationSec: number;
  /** True when nothing audible was found, so no segments were produced. */
  silent: boolean;
};

/**
 * Transcribe decoded audio part by part, turning each part into a timestamped segment.
 * Parts are sequential so the model is never asked to run twice at once.
 */
export async function transcribeSamples(
  samples: Float32Array,
  opts: TranscribeSamplesOptions,
): Promise<TranscribeSamplesResult> {
  const { startSec, language, transcribe, onProgress, shouldCancel } = opts;
  const partSeconds = opts.partSeconds ?? CHUNK_SECONDS;
  const durationSec = samples.length / WHISPER_SAMPLE_RATE;
  const parts = splitAudio(samples, partSeconds);
  const segments: Segment[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (shouldCancel?.()) throw new CancelledError();
    const part = parts[i];
    const partStart = startSec + i * partSeconds;
    const partEnd = partStart + part.length / WHISPER_SAMPLE_RATE;
    if (!isMostlySilent(part)) {
      const result = await transcribe(part, language === "auto" ? undefined : language);
      const text = result.text.trim();
      if (text) {
        segments.push({ start: partStart, end: partEnd, text, language: result.language });
      }
    }
    onProgress?.(i + 1, parts.length);
  }

  return { segments, durationSec, silent: segments.length === 0 };
}
