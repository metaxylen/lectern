export const WHISPER_SAMPLE_RATE = 16_000;

// Short windows so a Turkish sentence inside an English lecture is language-detected on its own.
export const CHUNK_SECONDS = Number(process.env.NEXT_PUBLIC_CHUNK_SECONDS) || 20;

function mixToMono(audio: AudioBuffer): Float32Array {
  if (audio.numberOfChannels === 1) return audio.getChannelData(0).slice();
  const out = new Float32Array(audio.length);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += ch[i] / audio.numberOfChannels;
  }
  return out;
}

/** Decode any browser-supported audio blob to mono PCM at its native sample rate. */
export async function decodeBlobToMono(
  data: Blob | ArrayBuffer,
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buffer.slice(0));
    return { samples: mixToMono(audio), sampleRate: audio.sampleRate };
  } finally {
    void ctx.close();
  }
}

export async function decodeToMono16k(data: Blob | ArrayBuffer): Promise<Float32Array> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ sampleRate: WHISPER_SAMPLE_RATE });
  try {
    const audio = await ctx.decodeAudioData(buffer);
    return mixToMono(audio);
  } finally {
    void ctx.close();
  }
}

/**
 * Split into target-sized windows, keeping a tail under five seconds with the preceding window.
 * Recorder timers and encoded durations need not land on the exact boundary; decoding a tiny
 * remainder on its own strips away its speech context and can produce an extra hallucinated line.
 */
export function splitAudio(samples: Float32Array, seconds = CHUNK_SECONDS): Float32Array[] {
  const size = seconds * WHISPER_SAMPLE_RATE;
  const minTail = Math.min(5 * WHISPER_SAMPLE_RATE, size);
  const parts: Float32Array[] = [];
  for (let i = 0; i < samples.length; i += size) {
    const end = i + size;
    if (samples.length - end < minTail) {
      parts.push(samples.slice(i));
      break;
    }
    parts.push(samples.slice(i, end));
  }
  return parts;
}

export function isMostlySilent(samples: Float32Array, threshold = 0.003): boolean {
  if (samples.length < WHISPER_SAMPLE_RATE * 0.5) return true;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 4) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (samples.length / 4)) < threshold;
}
