import { expect, openOptions, test } from "./fixtures";

test("keeps all session options after reloading and reopening the app", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await openOptions(page);

  await page.getByLabel("Lecture language (speech)").click();
  await page.getByRole("option", { name: "English (primary)", exact: true }).click();
  await page.getByLabel("Notes language", { exact: true }).click();
  await page.getByRole("option", { name: "English", exact: true }).click();
  await page.getByLabel("Whisper model (local)").click();
  await page.getByRole("option", { name: /^Base/ }).click();
  await page.getByLabel("Notes engine", { exact: true }).click();
  await page.getByRole("option", { name: "Offline summarizer", exact: true }).click();
  await page.getByRole("switch", { name: "Live transcript" }).click();

  await page.reload();
  await openOptions(page);
  await expect(page.getByLabel("Lecture language (speech)")).toContainText("English (primary)");
  await expect(page.getByLabel("Notes language", { exact: true })).toHaveText(/^English\s*▼?$/);
  await expect(page.getByLabel("Whisper model (local)")).toContainText("Base");
  await expect(page.getByLabel("Notes engine", { exact: true })).toContainText(
    "Offline summarizer",
  );
  await expect(page.getByRole("switch", { name: "Live transcript" })).not.toBeChecked();

  // A new page cannot reuse the previous page's React state or sessionStorage.
  const reopened = await context.newPage();
  await page.close();
  await reopened.goto("/");
  await openOptions(reopened);
  await expect(reopened.getByLabel("Lecture language (speech)")).toContainText("English (primary)");
  await expect(reopened.getByLabel("Notes language", { exact: true })).toHaveText(/^English\s*▼?$/);
  await expect(reopened.getByLabel("Whisper model (local)")).toContainText("Base");
  await expect(reopened.getByLabel("Notes engine", { exact: true })).toContainText(
    "Offline summarizer",
  );
  await expect(reopened.getByRole("switch", { name: "Live transcript" })).not.toBeChecked();
});
