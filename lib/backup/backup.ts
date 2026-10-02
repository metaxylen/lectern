import {
  createSession,
  deleteSession,
  getChunks,
  listSessions,
  putChunk,
  type AudioChunk,
} from "@/lib/audio-store";
import { parseLectures } from "@/lib/schemas";
import { readLectures, replaceAllLectures } from "@/lib/storage";
import type { Lecture } from "@/lib/types";
import { blobToBase64, base64ToBlob } from "./codec";
import { BackupFileSchema, type BackupFile } from "./types";

export const BACKUP_EXTENSION = ".lectern.json";

export async function buildBackupFile(): Promise<BackupFile> {
  const lectures = readLectures();
  const sessions = await listSessions();
  const audio: BackupFile["audio"] = [];

  for (const session of sessions) {
    const chunks = await getChunks(session.id);
    if (!chunks.length) continue;
    audio.push({
      ...session,
      chunks: await Promise.all(
        chunks.map(async (c) => ({
          index: c.index,
          mimeType: c.mimeType,
          complete: c.complete,
          durationSec: c.durationSec,
          status: c.status,
          segments: c.segments,
          error: c.error,
          dataBase64: await blobToBase64(c.blob),
        })),
      ),
    });
  }

  return {
    format: "lectern-backup",
    version: 1,
    exportedAt: Date.now(),
    lectures,
    audio,
  };
}

export function parseBackupJson(raw: string): BackupFile {
  const parsed = JSON.parse(raw) as unknown;
  return BackupFileSchema.parse(parsed);
}

export function parseBackupFileLoose(raw: unknown): { file: BackupFile | null; error?: string } {
  const lecturesOnly = parseLectures(raw);
  if (Array.isArray(raw) && lecturesOnly.lectures.length > 0) {
    return {
      file: {
        format: "lectern-backup",
        version: 1,
        exportedAt: Date.now(),
        lectures: lecturesOnly.lectures,
        audio: [],
      },
    };
  }
  try {
    const file = BackupFileSchema.parse(raw);
    return { file };
  } catch (err) {
    return {
      file: null,
      error: err instanceof Error ? err.message : "Invalid backup file",
    };
  }
}

export type ImportMode = "merge" | "replace";

export type ImportResult = {
  lecturesImported: number;
  audioSessionsImported: number;
  persisted: boolean;
};

async function restoreAudioSession(entry: BackupFile["audio"][number]): Promise<void> {
  const { chunks, ...session } = entry;
  await deleteSession(session.id).catch(() => {});
  await createSession({ ...session, status: session.status });
  for (const c of chunks) {
    const chunk: AudioChunk = {
      sessionId: session.id,
      index: c.index,
      blob: base64ToBlob(c.dataBase64, c.mimeType),
      mimeType: c.mimeType,
      complete: c.complete,
      durationSec: c.durationSec,
      status: c.status,
      segments: c.segments,
      error: c.error,
    };
    await putChunk(chunk);
  }
}

function mergeLectureLists(existing: Lecture[], incoming: Lecture[]): Lecture[] {
  const byId = new Map(existing.map((l) => [l.id, l]));
  for (const l of incoming) byId.set(l.id, l);
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Apply a parsed backup. `replace` clears local lectures and all IndexedDB sessions first. */
export async function applyBackup(file: BackupFile, mode: ImportMode): Promise<ImportResult> {
  let lectures: Lecture[];
  if (mode === "replace") {
    const sessions = await listSessions();
    for (const s of sessions) await deleteSession(s.id);
    lectures = file.lectures;
    const persisted = replaceAllLectures(lectures);
    for (const entry of file.audio) await restoreAudioSession(entry);
    return {
      lecturesImported: lectures.length,
      audioSessionsImported: file.audio.length,
      persisted,
    };
  }

  lectures = mergeLectureLists(readLectures(), file.lectures);
  const persisted = replaceAllLectures(lectures);
  let audioCount = 0;
  for (const entry of file.audio) {
    await restoreAudioSession(entry);
    audioCount++;
  }
  return {
    lecturesImported: file.lectures.length,
    audioSessionsImported: audioCount,
    persisted,
  };
}

export async function downloadBackupFile(): Promise<void> {
  const file = await buildBackupFile();
  const json = JSON.stringify(file);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const stamp = new Date(file.exportedAt).toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lectern-backup-${stamp}${BACKUP_EXTENSION}`;
  a.click();
  URL.revokeObjectURL(url);
}
