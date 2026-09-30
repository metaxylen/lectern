import { test as base, expect, type Page } from "@playwright/test";

export const STORAGE_KEY = "stt.lectures.v1";

export const TRANSCRIPT =
  "A thread is a unit of execution. Threads inside one process share the same heap. This is important for the exam. Processes do not share memory by default. Bellek, verinin saklandığı alandır.";

export function makeLecture(overrides: Record<string, unknown> = {}) {
  return {
    id: "lecture-1",
    createdAt: Date.UTC(2026, 8, 29, 9, 0),
    title: "Operating Systems 101",
    transcript: TRANSCRIPT,
    notes: null,
    notesLanguage: "en",
    audioLanguage: "auto",
    sttEngine: "Whisper base (local)",
    notesEngine: null,
    ...overrides,
  };
}

/** Seed localStorage before the app boots. */
export async function seedLectures(page: Page, lectures: unknown[]) {
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    [STORAGE_KEY, JSON.stringify(lectures)],
  );
}

// Fail any test that produces an unexpected console error or uncaught exception.
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, run) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (
        m.type() === "error" &&
        !/Failed to load resource|Dropped \d+ malformed stored lecture/.test(m.text())
      ) {
        problems.push(`console: ${m.text()}`);
      }
    });
    await run(page);
    expect(problems, "unexpected browser errors").toEqual([]);
  },
});

export { expect };

/** A valid, silent 1-second mono WAV so <audio> can actually load it. */
export function tinyWavBytes(seconds = 1, rate = 8000): number[] {
  const samples = seconds * rate;
  const buf = new Uint8Array(44 + samples * 2);
  const v = new DataView(buf.buffer);
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples * 2, true);
  return [...buf];
}

export type SeedSession = {
  id: string;
  title: string;
  status: "recording" | "complete";
  updatedAt?: number;
  /** Length of each seeded audio file. Use the real length when a test seeks inside it. */
  wavSeconds?: number;
  chunks: {
    index: number;
    status: "pending" | "done" | "failed" | "silent";
    segments?: { start: number; end: number; text: string; language?: string }[];
    durationSec?: number;
  }[];
};

/**
 * Write an audio session straight into IndexedDB before the app boots, mirroring the schema in
 * lib/audio-store.ts. Runs once per page (guarded) so reloads keep whatever the app did since.
 */
export async function seedAudioSession(page: Page, seed: SeedSession) {
  await page.addInitScript(
    ({ seed, wav }) => {
      const flag = `seeded:${seed.id}`;
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, "1");
      const open = indexedDB.open("stt-audio", 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        db.createObjectStore("sessions", { keyPath: "id" });
        db.createObjectStore("chunks", { keyPath: ["sessionId", "index"] });
      };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(["sessions", "chunks"], "readwrite");
        tx.objectStore("sessions").put({
          id: seed.id,
          createdAt: Date.UTC(2026, 8, 29, 8, 0),
          updatedAt: seed.updatedAt ?? Date.now() - 10 * 60_000,
          status: seed.status,
          source: "mic",
          title: seed.title,
          audioLanguage: "auto",
          notesLanguage: "en",
          sttEngine: "Whisper base (local)",
        });
        for (const c of seed.chunks) {
          tx.objectStore("chunks").put({
            sessionId: seed.id,
            index: c.index,
            blob: new Blob([new Uint8Array(wav)], { type: "audio/wav" }),
            mimeType: "audio/wav",
            complete: true,
            durationSec: c.durationSec ?? 1,
            status: c.status,
            segments: c.segments,
          });
        }
        tx.oncomplete = () => db.close();
      };
    },
    { seed, wav: tinyWavBytes(seed.wavSeconds ?? 1) },
  );
}

/** Expand the collapsible "Session options" panel (idempotent). */
export async function openOptions(page: Page) {
  const toggle = page.getByRole("button", { name: /^Session options/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

/** Pick an audio source tile by its title. */
export async function chooseSource(page: Page, title: RegExp | string) {
  await page.getByRole("radio", { name: title }).check({ force: true });
}
