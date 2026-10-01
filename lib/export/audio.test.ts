import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildLectureAudioBlob, buildLectureAudioDownload } from "./audio";

vi.mock("@/lib/audio-store", () => ({
  getChunks: vi.fn(),
}));

vi.mock("@/lib/stt/audio", () => ({
  decodeBlobToMono: vi.fn(),
}));

import { getChunks } from "@/lib/audio-store";
import { decodeBlobToMono } from "@/lib/stt/audio";

describe("buildLectureAudioBlob", () => {
  beforeEach(() => {
    vi.mocked(getChunks).mockReset();
  });

  it("returns null when there are no chunks", async () => {
    vi.mocked(getChunks).mockResolvedValue([]);
    expect(await buildLectureAudioBlob("x")).toBeNull();
  });

  it("passes through a single chunk", async () => {
    const blob = new Blob(["wav"], { type: "audio/wav" });
    vi.mocked(getChunks).mockResolvedValue([
      {
        sessionId: "x",
        index: 0,
        blob,
        mimeType: "audio/wav",
        complete: true,
        durationSec: 1,
        status: "done",
      },
    ]);
    const built = await buildLectureAudioBlob("x");
    expect(built?.blob).toBe(blob);
    expect(built?.mimeType).toBe("audio/wav");
  });
});

describe("buildLectureAudioDownload", () => {
  beforeEach(() => {
    vi.mocked(getChunks).mockReset();
    vi.mocked(decodeBlobToMono).mockReset();
  });

  it("keeps uploaded WAV without re-encoding", async () => {
    const blob = new Blob(["wav"], { type: "audio/wav" });
    vi.mocked(getChunks).mockResolvedValue([
      {
        sessionId: "x",
        index: 0,
        blob,
        mimeType: "audio/wav",
        complete: true,
        durationSec: 1,
        status: "done",
      },
    ]);
    const built = await buildLectureAudioDownload("x");
    expect(built?.extension).toBe("wav");
    expect(built?.blob).toBe(blob);
    expect(decodeBlobToMono).not.toHaveBeenCalled();
  });

  it("converts WebM chunks to WAV", async () => {
    vi.mocked(getChunks).mockResolvedValue([
      {
        sessionId: "x",
        index: 0,
        blob: new Blob(["webm"]),
        mimeType: "audio/webm",
        complete: true,
        durationSec: 1,
        status: "done",
      },
    ]);
    vi.mocked(decodeBlobToMono).mockResolvedValue({
      samples: new Float32Array([0, 0.5, -0.5]),
      sampleRate: 48_000,
    });
    const built = await buildLectureAudioDownload("x");
    expect(built?.extension).toBe("wav");
    expect(built?.blob.type).toBe("audio/wav");
    const bytes = new Uint8Array(await built!.blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF");
  });
});
