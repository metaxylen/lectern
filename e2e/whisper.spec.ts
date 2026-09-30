import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { openOptions } from "./fixtures";

// Opt-in: downloads the real Whisper tiny model (~40 MB) and transcribes synthesized speech.
//   E2E_WHISPER=1 npm run test:e2e -- e2e/whisper.spec.ts        (macOS: uses `say` + `afconvert`)
test.skip(!process.env.E2E_WHISPER, "set E2E_WHISPER=1 to run the real-model test");
test.setTimeout(240_000);

function speechFile(text: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "stt-"));
  const aiff = path.join(dir, "speech.aiff");
  const wav = path.join(dir, "speech.wav");
  execFileSync("say", ["-o", aiff, text]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", aiff, wav]);
  return wav;
}

test("uploads speech, transcribes it with timestamps and stores the audio", async ({ page }) => {
  const wav = speechFile(
    "A thread is a unit of execution. Threads inside one process share the same heap. This is important for the exam.",
  );
  await page.goto("/");
  // Smallest model keeps the download short.
  await openOptions(page);
  await page.getByLabel("Whisper model (local)").click();
  await page.getByRole("option", { name: /Tiny/ }).click();

  await page.locator('input[type="file"]').setInputFiles(wav);

  const segments = page.getByRole("list", { name: "Transcript segments" });
  await expect(segments).toBeVisible({ timeout: 200_000 });
  await expect(segments).toContainText(/important for the exam/i);
  await expect(page.getByRole("button", { name: "Play from 0:00" })).toBeVisible();
  await expect(page.getByText("Notes are ready")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/audio on this device/)).toBeVisible();

  // The model is now listed as downloaded and can be removed.
  await expect(page.getByRole("list", { name: "Downloaded models" })).toContainText("tiny");
});
