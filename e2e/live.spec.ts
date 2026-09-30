import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { openOptions } from "./fixtures";

// Opt-in: downloads the real Whisper tiny model and "speaks" into a fake microphone.
//   E2E_WHISPER=1 npm run test:e2e -- e2e/live.spec.ts        (macOS: uses `say` + `afconvert`)
test.skip(!process.env.E2E_WHISPER, "set E2E_WHISPER=1 to run the real-model test");
test.setTimeout(300_000);

const SPEECH =
  "A thread is a unit of execution. Threads inside one process share the same heap. " +
  "A race condition happens when the result depends on the order in which threads run. " +
  "A mutex is a lock that only one thread can hold at a time. " +
  "This is important for the exam, so please remember the definition of a race condition.";

function speechFile() {
  const dir = mkdtempSync(path.join(tmpdir(), "stt-live-"));
  const aiff = path.join(dir, "speech.aiff");
  const wav = path.join(dir, "speech.wav");
  execFileSync("say", ["-o", aiff, SPEECH]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@48000", aiff, wav]);
  return wav;
}

test("live transcript shows words while recording, then the final transcript replaces it", async ({
  baseURL,
}) => {
  const wav = speechFile();
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${wav}`,
    ],
  });
  const context = await browser.newContext({ permissions: ["microphone"], baseURL });
  const page = await context.newPage();
  try {
    await page.goto("/");
    // Fix the language: this test is about the live mechanics, not language detection on a tiny model.
    await openOptions(page);
    await page.getByLabel("Lecture language (speech)").click();
    await page.getByRole("option", { name: /^English/ }).click();
    await page.getByLabel("Whisper model (local)").click();
    await page.getByRole("option", { name: /Tiny/ }).click();
    await page.getByRole("button", { name: "Record" }).click();

    // Live text appears before any 20-second chunk could have finished.
    const started = Date.now();
    const live = page.locator("span", { hasText: /^live$/ });
    await expect(live).toBeVisible({ timeout: 120_000 });
    const firstLiveAfter = (Date.now() - started) / 1000;
    const draft = await page.getByText("live", { exact: true }).locator("xpath=..").innerText();
    console.log(`first live text after ${firstLiveAfter.toFixed(1)}s: ${draft}`);
    expect(draft.length).toBeGreaterThan(8);

    await page.getByRole("button", { name: /Stop & make notes/ }).click();
    const segments = page.getByRole("list", { name: "Transcript segments" });
    await expect(segments).toBeVisible({ timeout: 120_000 });
    await expect(segments).toContainText(/exam|thread|mutex/i);
    // Nothing is left over from the draft once the real transcript is in.
    await expect(page.locator("span", { hasText: /^live$/ })).toHaveCount(0);
  } finally {
    await browser.close();
  }
});
