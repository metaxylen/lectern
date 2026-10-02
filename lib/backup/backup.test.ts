// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { resetAudioStoreForTests } from "@/lib/audio-store";
import { resetStorageCache, saveLecture, STORAGE_KEY } from "@/lib/storage";
import type { Lecture } from "@/lib/types";
import { applyBackup, buildBackupFile, parseBackupJson } from "./backup";
import { base64ToBlob, blobToBase64 } from "./codec";

const lecture = (id: string): Lecture => ({
  id,
  createdAt: 1,
  title: "Test",
  transcript: "hello world",
  notes: null,
  notesLanguage: "en",
  audioLanguage: "auto",
  sttEngine: "whisper",
  notesEngine: null,
  hasAudio: true,
});

beforeEach(async () => {
  localStorage.clear();
  resetStorageCache();
  await resetAudioStoreForTests();
  indexedDB.deleteDatabase("stt-audio");
});

describe("backup", () => {
  it("round-trips lectures through JSON", async () => {
    saveLecture(lecture("a"));
    const built = await buildBackupFile();
    expect(built.format).toBe("lectern-backup");
    expect(built.lectures).toHaveLength(1);
    const parsed = parseBackupJson(JSON.stringify(built));
    expect(parsed.lectures[0].id).toBe("a");
  });

  it("merge import keeps unrelated lectures", async () => {
    saveLecture(lecture("keep"));
    const file = await buildBackupFile();
    saveLecture(lecture("local-only"));
    file.lectures = [lecture("imported")];
    await applyBackup(file, "merge");
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]").map(
      (l: Lecture) => l.id,
    );
    expect(ids).toContain("keep");
    expect(ids).toContain("local-only");
    expect(ids).toContain("imported");
  });

  it("codec round-trips blob bytes", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
    const b64 = await blobToBase64(blob);
    const back = base64ToBlob(b64, "audio/webm");
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
