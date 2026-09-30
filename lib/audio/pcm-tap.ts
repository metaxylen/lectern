import { PcmRing } from "./pcm-buffer";

export const TAP_SAMPLE_RATE = 16_000;

export type PcmTap = {
  ring: PcmRing;
  /** Disconnect and release the audio graph. */
  stop: () => void;
};

// Runs on the audio thread: forwards mono frames to the main thread.
const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("pcm-tap", Tap);
`;

/**
 * Listen to a stream and keep its last minute of audio as 16 kHz mono PCM. This is a second,
 * independent consumer of the stream: it does not affect what the MediaRecorder saves.
 */
export async function startPcmTap(stream: MediaStream, seconds = 60): Promise<PcmTap> {
  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ sampleRate: TAP_SAMPLE_RATE });
  const ring = new PcmRing(TAP_SAMPLE_RATE, seconds);
  const source = ctx.createMediaStreamSource(stream);

  const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const node = new AudioWorkletNode(ctx, "pcm-tap", { numberOfOutputs: 0 });
  node.port.onmessage = (e: MessageEvent<Float32Array>) => ring.push(e.data);
  source.connect(node);
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});

  return {
    ring,
    stop() {
      node.port.onmessage = null;
      try {
        source.disconnect();
        node.disconnect();
      } catch {
        // already disconnected
      }
      void ctx.close().catch(() => {});
    },
  };
}
