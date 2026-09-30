import { expect, makeLecture, seedAudioSession, seedLectures, test } from "./fixtures";

const SEGMENTS = [
  { start: 0, end: 20, text: "A race condition depends on the order threads run.", language: "en" },
  { start: 20, end: 40, text: "Bunu vizede mutlaka soracağım.", language: "tr" },
];

const RICH_NOTES = {
  title: "Synchronization basics",
  summary: "Race conditions arise when thread order changes the result.",
  keyPoints: ["A race condition depends on thread order."],
  definitions: [{ term: "race condition", definition: "Result depends on thread order." }],
  examQuestions: [{ question: "What is a race condition?", answer: "Order-dependent result." }],
  examHints: ["Midterm: memorize the definition of race condition."],
  sections: [
    { title: "Races", summary: "What races are.", start: 0 },
    { title: "Locks", summary: "How mutexes help.", start: 20 },
  ],
  flashcards: [
    { front: "Mutex?", back: "A lock only one thread can hold." },
    { front: "Race condition?", back: "Order-dependent result." },
  ],
};

const ndjson = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";

test.describe("rich notes", () => {
  test.beforeEach(async ({ page }) => {
    await seedLectures(page, [
      makeLecture({
        id: "rich",
        hasAudio: true,
        segments: SEGMENTS,
        notes: RICH_NOTES,
        notesEngine: "ollama",
      }),
    ]);
    await seedAudioSession(page, {
      id: "rich",
      title: "Operating Systems 101",
      status: "complete",
      chunks: [{ index: 0, status: "done", segments: SEGMENTS, durationSec: 40 }],
    });
    await page.goto("/");
    await page
      .getByRole("button", { name: /^Synchronization basics|^Operating Systems 101/ })
      .first()
      .click();
  });

  test("shows exam hints, chapters and flashcards", async ({ page }) => {
    await expect(page.getByRole("list", { name: "Exam & homework notes" })).toContainText(
      "Midterm: memorize the definition of race condition.",
    );
    const chapters = page.getByRole("list", { name: "Chapters" });
    await expect(chapters).toContainText("Races");
    await expect(chapters).toContainText("Locks");
    await expect(page.getByLabel("Flashcards")).toContainText("Mutex?");
  });

  test("flashcards reveal their answer on click", async ({ page }) => {
    const card = page.getByRole("button", { name: /^Mutex\?/ });
    await expect(page.getByText("A lock only one thread can hold.")).toHaveCount(0);
    await card.click();
    await expect(page.getByText("A lock only one thread can hold.")).toBeVisible();
    await card.click();
    await expect(page.getByText("A lock only one thread can hold.")).toHaveCount(0);
  });

  test("chapter timestamps jump to the audio", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Play audio" })).toBeVisible();
    await page
      .getByRole("list", { name: "Chapters" })
      .getByRole("button", { name: "Play from 0:20" })
      .click();
    await expect(page.getByRole("slider", { name: "Audio position" })).toHaveValue("20");
  });

  test("downloads flashcards for Anki", async ({ page }) => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download for Anki" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/-anki\.tsv$/);
    const text = await (await import("node:fs/promises")).readFile(await file.path(), "utf8");
    expect(text).toContain("Mutex?\tA lock only one thread can hold.");
  });

  test("includes the new sections in the Markdown export", async ({ page }) => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .md" }).click();
    const text = await (
      await import("node:fs/promises")
    ).readFile(await (await download).path(), "utf8");
    expect(text).toContain("## Exam & homework notes");
    expect(text).toContain("**[0:20]** **Locks**");
    expect(text).toContain("## Flashcards");
  });
});

test.describe("generating notes", () => {
  test("sends timestamps and the student's hints, and shows quality warnings", async ({ page }) => {
    await seedLectures(page, [makeLecture({ id: "gen", segments: SEGMENTS })]);
    let body: Record<string, unknown> = {};
    await page.route("**/api/notes", async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: ndjson([
          { type: "progress", message: "Connecting to Ollama" },
          {
            type: "result",
            result: {
              notes: RICH_NOTES,
              engine: "ollama",
              model: "qwen2.5:7b",
              fallbackReasons: [],
              warnings: ["1 definition removed: the term was not found in the transcript."],
              elapsedMs: 4200,
            },
          },
        ]),
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: /^Operating Systems 101/ }).click();
    await page.getByLabel("Course or topic hints (optional)").fill("OS week 6: mutex, semaphore");
    await page.getByRole("button", { name: "Generate notes" }).click();

    await expect(page.getByText("Notes are ready")).toBeVisible();
    expect(body).toMatchObject({
      segments: SEGMENTS,
      context: "OS week 6: mutex, semaphore",
      stream: true,
      engine: "auto",
    });
    await expect(page.getByRole("list", { name: "Notes quality warnings" })).toContainText(
      "1 definition removed",
    );
    await expect(page.getByText("Ollama · qwen2.5:7b")).toBeVisible();

    // The hints are remembered with the lecture.
    await page.reload();
    await page.getByRole("button", { name: /^Synchronization basics/ }).click();
    await expect(page.getByLabel("Course or topic hints (optional)")).toHaveValue(
      "OS week 6: mutex, semaphore",
    );
  });

  test("can cancel a slow generation", async ({ page }) => {
    await seedLectures(page, [makeLecture({ id: "slow" })]);
    await page.route("**/api/notes", () => {
      // Never answer: the request stays open until the page aborts it.
    });
    await page.goto("/");
    await page.getByRole("button", { name: /^Operating Systems 101/ }).click();
    await page.getByRole("button", { name: "Generate notes" }).click();
    await expect(page.getByRole("status")).toContainText("Preparing");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Notes generation cancelled")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate notes" })).toBeEnabled();
  });
});
