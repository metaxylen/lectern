import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { makeLecture, seedAudioSession, seedLectures } from "./fixtures";

// Regenerates the README screenshots from seeded, realistic data:
//   SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate docs/images");
test.use({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });

const OUT = path.join(process.cwd(), "docs", "images");

const SEGMENTS = [
  {
    start: 0,
    end: 20,
    text: "Today we talk about synchronization. When two threads update the same variable at the same time we get a race condition.",
    language: "en",
  },
  {
    start: 20,
    end: 40,
    text: "A race condition means the result depends on the order in which the threads happen to run.",
    language: "en",
  },
  {
    start: 40,
    end: 60,
    text: "Bunu iyi anlayın çünkü vizede mutlaka çıkacak, race condition tanımını ezberleyin.",
    language: "tr",
  },
  {
    start: 60,
    end: 80,
    text: "To prevent it we use mutual exclusion. A mutex is a lock that only one thread can hold at a time.",
    language: "en",
  },
  {
    start: 80,
    end: 100,
    text: "A semaphore is more general: it keeps a counter, wait decrements it and blocks at zero, signal increments it.",
    language: "en",
  },
  {
    start: 100,
    end: 120,
    text: "Deadlock needs four conditions: mutual exclusion, hold and wait, no preemption and circular wait.",
    language: "en",
  },
  {
    start: 120,
    end: 140,
    text: "Homework three is due next Friday: a producer consumer queue built with semaphores.",
    language: "en",
  },
];

const NOTES = {
  title: "Synchronization: races, mutexes, semaphores and deadlock",
  summary:
    "The lecture explains how concurrent threads corrupt shared state through race conditions and how mutual exclusion, mutexes and semaphores prevent it. It closes with deadlock, the four conditions that cause it, and the observation that breaking any one of them avoids it.",
  keyPoints: [
    "A race condition occurs when two threads update the same variable and the result depends on the order in which they run.",
    "A mutex is a lock that only one thread can hold at a time; the code it protects is the critical section.",
    "A semaphore keeps a counter: wait decrements it and blocks at zero, signal increments it and wakes one waiting thread.",
    "Deadlock requires mutual exclusion, hold and wait, no preemption and circular wait at the same time.",
    "Removing any one of the four deadlock conditions makes deadlock impossible.",
  ],
  definitions: [
    {
      term: "Race condition",
      definition: "A situation where the result depends on the order in which threads run.",
    },
    { term: "Mutex", definition: "A lock that only one thread can hold at a time." },
    {
      term: "Semaphore",
      definition:
        "A counter-based primitive with wait and signal operations, more general than a mutex.",
    },
  ],
  examQuestions: [
    {
      question: "Define a race condition.",
      answer: "The outcome depends on the order in which threads happen to run.",
    },
    {
      question: "Name the four conditions required for deadlock.",
      answer: "Mutual exclusion, hold and wait, no preemption, circular wait.",
    },
    {
      question: "How does a semaphore differ from a mutex?",
      answer: "It keeps a counter, so several threads can be admitted, not just one.",
    },
  ],
  examHints: [
    "Midterm: memorize the definition of race condition.",
    "Homework 3 is due next Friday (producer-consumer queue with semaphores).",
  ],
  sections: [
    {
      title: "Race conditions",
      summary: "Why unsynchronized updates corrupt shared data.",
      start: 0,
    },
    {
      title: "Mutexes and semaphores",
      summary: "Locks, critical sections and counters.",
      start: 60,
    },
    {
      title: "Deadlock",
      summary: "The four necessary conditions and how to avoid them.",
      start: 100,
    },
  ],
  flashcards: [
    { front: "Race condition?", back: "The result depends on the order in which threads run." },
    {
      front: "What does signal do?",
      back: "Increments the semaphore counter and wakes one waiting thread.",
    },
    {
      front: "Four deadlock conditions?",
      back: "Mutual exclusion, hold and wait, no preemption, circular wait.",
    },
    {
      front: "Mutex vs semaphore?",
      back: "A mutex admits one thread; a semaphore keeps a counter.",
    },
  ],
  glossary: [
    { term: "race condition", turkish: "yarış durumu" },
    { term: "deadlock", turkish: "kilitlenme" },
    { term: "semaphore", turkish: "semafor" },
    { term: "critical section", turkish: "kritik bölge" },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/status", (route) =>
    route.fulfill({
      json: {
        ollama: {
          reachable: true,
          host: "http://127.0.0.1:11434",
          models: ["gemma4:12b"],
          selected: "gemma4:12b",
        },
        gemini: { configured: false, model: "gemini-flash-latest" },
      },
    }),
  );
  await seedLectures(page, [
    makeLecture({
      id: "demo",
      title: "Operating Systems: synchronization",
      hasAudio: true,
      segments: SEGMENTS,
      transcript: SEGMENTS.map((s) => s.text).join(" "),
      durationSec: 140,
      notes: NOTES,
      notesLanguage: "en",
      notesGlossary: true,
      notesEngine: "ollama",
      sttEngine: "Whisper small (local)",
    }),
    makeLecture({
      id: "older",
      title: "Databases: transactions and isolation",
      createdAt: Date.UTC(2026, 8, 22, 9, 0),
      notes: NOTES,
      notesEngine: "ollama",
    }),
    makeLecture({
      id: "oldest",
      title: "Algorithms: dynamic programming",
      createdAt: Date.UTC(2026, 8, 15, 9, 0),
      notes: NOTES,
      notesEngine: "ollama",
    }),
  ]);
  await seedAudioSession(page, {
    id: "demo",
    title: "Operating Systems: synchronization",
    status: "complete",
    chunks: SEGMENTS.map((s, i) => ({
      index: i,
      status: "done" as const,
      segments: [s],
      durationSec: 20,
    })),
  });
});

async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Operating Systems: synchronization/ }).click();
  await expect(page.getByRole("list", { name: "Chapters" })).toBeVisible();
  await page.waitForTimeout(400);
}

test("overview", async ({ page }) => {
  await open(page);
  await page.screenshot({ path: path.join(OUT, "overview.png") });
});

test("notes", async ({ page }) => {
  await open(page);
  await page
    .getByRole("region", { name: "Notes" })
    .screenshot({ path: path.join(OUT, "notes.png") });
});

test("transcript with audio", async ({ page }) => {
  await open(page);
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("list", { name: "Transcript segments" }) });
  await card.screenshot({ path: path.join(OUT, "transcript.png") });
});

test("audio sources", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Audio source").click();
  await page.getByRole("option", { name: /^Tab audio \+ my microphone/ }).click();
  await page.getByRole("button", { name: "Record" }).scrollIntoViewIfNeeded();
  const panel = page
    .getByLabel("Audio source")
    .locator("xpath=ancestor::*[contains(@data-slot,'card')][1]");
  await panel.screenshot({ path: path.join(OUT, "audio-sources.png") });
});
