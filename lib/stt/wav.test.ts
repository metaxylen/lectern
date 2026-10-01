import { describe, expect, it } from "vitest";
import { WHISPER_SAMPLE_RATE } from "./audio";
import { encodeWavPcm16 } from "./wav";

describe("encodeWavPcm16", () => {
  it("writes a valid mono 16-bit header", () => {
    const samples = new Float32Array([0, 0.5, -1, 1]);
    const wav = encodeWavPcm16(samples, 16_000);
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.subarray(8, 16))).toBe("WAVEfmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
    expect(wav.byteLength).toBe(44 + samples.length * 2);
  });

  it("clamps out-of-range samples", () => {
    const wav = encodeWavPcm16(new Float32Array([2, -2]), WHISPER_SAMPLE_RATE);
    const view = new DataView(wav.buffer, 44);
    expect(view.getInt16(0, true)).toBe(0x7fff);
    expect(view.getInt16(2, true)).toBe(-0x8000);
  });
});
