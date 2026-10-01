import { expect, test, type Page } from "@playwright/test";

// These tests use a fake microphone and block the Whisper model download, so they exercise the
// real recorder + IndexedDB persistence + failure handling without needing the model.
// (They deliberately do not use the strict console-error fixture: failures are logged on purpose.)

async function blockTranscription(page: Page) {
  await page.route(/huggingface\.co|hf\.co|jsdelivr/, (route) => route.abort());
  await page.route("**/api/transcribe**", (route) => route.abort());
}

test("a recording whose transcription fails keeps its audio and can be retried", async ({
  page,
}) => {
  await blockTranscription(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByRole("button", { name: /Stop & make notes/ })).toBeVisible();
  await page.waitForTimeout(3500); // let the recorder flush at least one timeslice
  await page.getByRole("button", { name: /Stop & make notes/ }).click();

  await expect(page.getByText(/The audio is saved, but it could not be transcribed/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/audio on this device/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Retry 1 untranscribed part/ })).toBeVisible();
  await expect(page.locator("aside li").first()).toContainText("no notes yet");

  // It survives a reload as a normal, completed lecture (not an "interrupted" one).
  await page.reload();
  await expect(page.getByRole("region", { name: "Unfinished recordings" })).toHaveCount(0);
  await page.locator("aside li button").first().click();
  await expect(page.getByRole("button", { name: /Retry 1 untranscribed part/ })).toBeVisible();
});

test("closing the tab mid-recording leaves audio that can be recovered", async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["microphone"] });
  const first = await context.newPage();
  await blockTranscription(first);
  await first.goto("/");
  await first.getByRole("button", { name: "Record" }).click();
  await expect(first.getByRole("button", { name: /Stop & make notes/ })).toBeVisible();
  await first.waitForTimeout(4500); // several 2s timeslices are persisted while recording
  await first.close({ runBeforeUnload: false }); // simulates a crash / killed tab

  const second = await context.newPage();
  await blockTranscription(second);
  // The dead tab's session would look "live" for 30s; age it like time had passed.
  await second.addInitScript(() => {
    const open = indexedDB.open("stt-audio", 1);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("sessions")) return db.close();
      const tx = db.transaction("sessions", "readwrite");
      const store = tx.objectStore("sessions");
      store.openCursor().onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) return;
        cursor.update({ ...cursor.value, updatedAt: Date.now() - 5 * 60_000 });
        cursor.continue();
      };
      tx.oncomplete = () => db.close();
    };
  });
  await second.goto("/");

  const banner = second.getByRole("region", { name: "Unfinished recordings" });
  await expect(banner).toContainText("An earlier recording was interrupted");
  await banner.getByRole("button", { name: "Recover" }).click();

  // Whisper is blocked, so transcription fails, but the recovered audio is kept and retryable.
  await expect(second.getByText(/audio on this device/)).toBeVisible({ timeout: 30_000 });
  await expect(second.getByRole("button", { name: /Retry \d+ untranscribed part/ })).toBeVisible();
  await context.close();
});
