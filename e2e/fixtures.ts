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
