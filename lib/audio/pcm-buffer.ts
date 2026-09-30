/**
 * A fixed-size ring of the most recent audio samples (mono, 16 kHz), so the live transcript can ask
 * "what was said in the last N seconds" without keeping the whole recording in memory.
 */
export class PcmRing {
  private readonly data: Float32Array;
  private written = 0; // total samples ever written

  constructor(
    readonly sampleRate: number,
    seconds: number,
  ) {
    this.data = new Float32Array(Math.ceil(sampleRate * seconds));
  }

  /** Total samples pushed so far; a stable position that only grows. */
  get position(): number {
    return this.written;
  }

  push(samples: Float32Array) {
    const cap = this.data.length;
    // If one push is larger than the ring, only its tail can matter.
    const src = samples.length > cap ? samples.subarray(samples.length - cap) : samples;
    const start = this.written + (samples.length - src.length);
    for (let i = 0; i < src.length; i++) this.data[(start + i) % cap] = src[i];
    this.written += samples.length;
  }

  /** Samples from absolute position `from` up to now, clipped to what the ring still holds. */
  since(from: number): Float32Array {
    const cap = this.data.length;
    const oldest = Math.max(0, this.written - cap);
    const begin = Math.max(from, oldest);
    const length = Math.max(0, this.written - begin);
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) out[i] = this.data[(begin + i) % cap];
    return out;
  }

  /** The last `seconds` of audio. */
  recent(seconds: number): Float32Array {
    return this.since(this.written - Math.floor(seconds * this.sampleRate));
  }
}
