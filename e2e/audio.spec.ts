import { expect, makeLecture, seedAudioSession, seedLectures, test } from "./fixtures";

const SEGMENTS = [
  { start: 0, end: 20, text: "A thread is a unit of execution.", language: "en" },
  { start: 20, end: 40, text: "Bellek, verinin saklandığı alandır.", language: "tr" },
];

test.describe("recovery of interrupted recordings", () => {
  test("offers recovery, then rebuilds the transcript and notes from stored audio", async ({
    page,
  }) => {
    await seedAudioSession(page, {
      id: "crashed-1",
      title: "Lecture 29 Eyl",
      status: "recording",
      chunks: [
        { index: 0, status: "done", segments: [SEGMENTS[0]], durationSec: 20 },
        { index: 1, status: "done", segments: [SEGMENTS[1]], durationSec: 20 },
      ],
    });
    await page.goto("/");

    const banner = page.getByRole("region", { name: "Unfinished recordings" });
    await expect(banner).toContainText("An earlier recording was interrupted");
    await banner.getByRole("button", { name: "Recover" }).click();

    await expect(page.getByText("Notes are ready")).toBeVisible();
    const list = page.getByRole("list", { name: "Transcript segments" });
    await expect(list).toContainText("A thread is a unit of execution.");
    await expect(list).toContainText("Bellek, verinin saklandığı alandır.");
    await expect(list.getByText("tr", { exact: true })).toBeVisible();
    await expect(banner).toHaveCount(0);

    // The recovered lecture is saved in history and its audio stays available.
    await expect(
      page.getByRole("list", { name: "Past lectures" }).or(page.locator("aside li")).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Play audio" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("region", { name: "Unfinished recordings" })).toHaveCount(0);
  });

  test("discarding removes the unfinished recording for good", async ({ page }) => {
    await seedAudioSession(page, {
      id: "crashed-2",
      title: "Throwaway",
      status: "recording",
      chunks: [{ index: 0, status: "pending" }],
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Discard Throwaway" }).click();
    await expect(page.getByRole("region", { name: "Unfinished recordings" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: "Unfinished recordings" })).toHaveCount(0);
  });

  test("does not offer recordings that another tab is still writing", async ({ page }) => {
    await seedAudioSession(page, {
      id: "live-elsewhere",
      title: "Live",
      status: "recording",
      updatedAt: Date.now(),
      chunks: [{ index: 0, status: "pending" }],
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Record" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Unfinished recordings" })).toHaveCount(0);
  });

  test("ignores completed sessions", async ({ page }) => {
    await seedAudioSession(page, {
      id: "done-1",
      title: "Finished",
      status: "complete",
      chunks: [{ index: 0, status: "done", segments: [SEGMENTS[0]] }],
    });
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Unfinished recordings" })).toHaveCount(0);
  });
});

test.describe("saved audio and timestamps", () => {
  const lecture = makeLecture({
    id: "with-audio",
    hasAudio: true,
    segments: SEGMENTS,
    durationSec: 40,
    transcript: SEGMENTS.map((s) => s.text).join(" "),
  });

  test.beforeEach(async ({ page }) => {
    await seedLectures(page, [lecture]);
    await seedAudioSession(page, {
      id: "with-audio",
      title: lecture.title as string,
      status: "complete",
      chunks: [
        { index: 0, status: "done", segments: [SEGMENTS[0]], durationSec: 20 },
        { index: 1, status: "done", segments: [SEGMENTS[1]], durationSec: 20 },
      ],
    });
    await page.goto("/");
    await page.getByRole("button", { name: /^Operating Systems 101/ }).click();
  });

  test("shows timestamped segments and audio controls", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Play from 0:00" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play from 0:20" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play audio" })).toBeVisible();
    await expect(page.getByText(/audio on this device/)).toBeVisible();
  });

  test("downloads stored lecture audio", async ({ page }) => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download audio" }).first().click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/operating-systems-101\.wav$/i);
    const bytes = await (await import("node:fs/promises")).readFile(await file.path());
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  test("exports timestamps in the Markdown download", async ({ page }) => {
    await page.getByRole("button", { name: "Generate notes" }).click();
    await expect(page.getByText("Notes are ready")).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .md" }).click();
    const path = await (await download).path();
    const text = await (await import("node:fs/promises")).readFile(path, "utf8");
    expect(text).toContain("[0:00] A thread is a unit of execution.");
    expect(text).toContain("[0:20] Bellek, verinin saklandığı alandır.");
  });

  test("deleting the audio keeps the transcript", async ({ page }) => {
    await page.getByRole("button", { name: "Delete audio" }).click();
    await expect(page.getByRole("button", { name: "Play audio" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete audio" })).toHaveCount(0);
    await expect(page.getByText("A thread is a unit of execution.")).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: /^Operating Systems 101/ }).click();
    await expect(page.getByRole("button", { name: "Play audio" })).toHaveCount(0);
    await expect(page.getByText("A thread is a unit of execution.")).toBeVisible();
  });

  test("offers retry when some parts were never transcribed", async ({ page }) => {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const open = indexedDB.open("stt-audio", 1);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("chunks", "readwrite");
          const store = tx.objectStore("chunks");
          const get = store.get(["with-audio", 1]);
          get.onsuccess = () => store.put({ ...get.result, status: "failed", segments: [] });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      });
    });
    await page.reload();
    await page.getByRole("button", { name: /^Operating Systems 101/ }).click();
    await expect(page.getByRole("button", { name: /Retry 1 untranscribed part/ })).toBeVisible();
  });
});

test.describe("device storage panel", () => {
  test("starts empty", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("No Whisper models downloaded yet.")).toBeVisible();
  });
});
