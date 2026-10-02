import { getChunks } from "@/lib/audio-store";
import { decodeBlobToMono } from "@/lib/stt/audio";
import { encodeWavPcm16 } from "@/lib/stt/wav";
import { slugify } from "@/lib/markdown";

function baseMime(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isStoredWav(mimeType: string): boolean {
  const base = baseMime(mimeType);
  return base === "audio/wav" || base === "audio/x-wav";
}

/** Merge IndexedDB chunks into one blob (same format as stored). */
export async function buildLectureAudioBlob(
  sessionId: string,
): Promise<{ blob: Blob; mimeType: string } | null> {
  const chunks = await getChunks(sessionId);
  const parts = chunks.filter((c) => c.blob.size > 0);
  if (!parts.length) return null;
  const mimeType = parts[0].mimeType || parts[0].blob.type || "audio/webm";
  const blob =
    parts.length === 1
      ? parts[0].blob
      : new Blob(
          parts.map((c) => c.blob),
          { type: mimeType },
        );
  return { blob, mimeType };
}

/**
 * Build a file for download. Recordings are stored as WebM/Opus (what MediaRecorder writes); exports
 * are converted to WAV so QuickTime, Voice Memos, and Anki can open them without extra codecs.
 */
export async function buildLectureAudioDownload(
  sessionId: string,
): Promise<{ blob: Blob; extension: string } | null> {
  const chunks = await getChunks(sessionId);
  const parts = chunks.filter((c) => c.blob.size > 0);
  if (!parts.length) return null;

  const firstMime = parts[0].mimeType || parts[0].blob.type || "";
  if (parts.length === 1 && isStoredWav(firstMime)) {
    return { blob: parts[0].blob, extension: "wav" };
  }
  if (parts.every((c) => isStoredWav(c.mimeType || c.blob.type))) {
    const merged = await buildLectureAudioBlob(sessionId);
    if (!merged) return null;
    return { blob: merged.blob, extension: "wav" };
  }

  let sampleRate = 0;
  const pieces: Float32Array[] = [];
  for (const c of parts) {
    const { samples, sampleRate: rate } = await decodeBlobToMono(c.blob);
    if (!sampleRate) sampleRate = rate;
    pieces.push(samples);
  }
  const total = pieces.reduce((n, p) => n + p.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const p of pieces) {
    merged.set(p, offset);
    offset += p.length;
  }
  const wav = encodeWavPcm16(merged, sampleRate || 48_000);
  return {
    blob: new Blob(
      [wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer],
      { type: "audio/wav" },
    ),
    extension: "wav",
  };
}

/** Trigger a browser download of the lecture audio kept on this device. */
export async function downloadLectureAudio(sessionId: string, title: string): Promise<void> {
  const built = await buildLectureAudioDownload(sessionId);
  if (!built) throw new Error("No audio is stored for this lecture.");
  const url = URL.createObjectURL(built.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(title)}.${built.extension}`;
  a.click();
  URL.revokeObjectURL(url);
}
