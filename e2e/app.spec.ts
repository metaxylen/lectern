import { expect, makeLecture, seedLectures, test } from "./fixtures";

test.describe("first visit", () => {
  test("renders the recorder, setup and empty history", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Lectern", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Upload audio" })).toBeEnabled();
    await expect(page.getByText("Nothing saved yet")).toBeVisible();
    await expect(page.getByRole("list", { name: "Engine status" })).toContainText(
      "Offline summarizer: always available",
    );
  });

  test("engine strip reflects server status", async ({ page }) => {
    await page.goto("/");
    const strip = page.getByRole("list", { name: "Engine status" });
    await expect(strip).toContainText("Ollama: not running");
    await expect(strip).toContainText("Gemini: no key (optional)");
  });
});

test.describe("history", () => {
  test("lists saved lectures and opens one", async ({ page }) => {
    await seedLectures(page, [makeLecture()]);
    await page.goto("/");
    await page.getByRole("button", { name: /^Operating Systems 101/ }).click();
    await expect(page.getByText("A thread is a unit of execution.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate notes" })).toBeVisible();
  });

  test("deletes a lecture", async ({ page }) => {
    await seedLectures(page, [makeLecture()]);
    await page.goto("/");
    await page.getByRole("button", { name: "Delete Operating Systems 101" }).click();
    await expect(page.getByText("Nothing saved yet")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Nothing saved yet")).toBeVisible();
  });

  test("survives corrupt storage and drops only the malformed entries", async ({ page }) => {
    await seedLectures(page, [makeLecture(), { id: "broken" }, "junk"]);
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^Operating Systems 101/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /broken/ })).toHaveCount(0);
  });

  test("survives completely invalid JSON in storage", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("stt.lectures.v1", "{not json"));
    await page.goto("/");
    await expect(page.getByText("Nothing saved yet")).toBeVisible();
  });
});

test.describe("notes", () => {
  test("generates notes offline from a saved transcript and exports Markdown", async ({ page }) => {
    await seedLectures(page, [makeLecture()]);
    await page.goto("/");
    await page.getByRole("button", { name: /^Operating Systems 101/ }).click();
    await page.getByRole("button", { name: "Generate notes" }).click();

    await expect(page.getByText("Notes are ready")).toBeVisible();
    await expect(page.getByRole("button", { name: "Regenerate notes" })).toBeVisible();
    // Ollama is unreachable and no Gemini key is set in the e2e server, so auto falls back.
    await expect(page.getByText("Fell back to the offline summarizer")).toBeVisible();
    await expect(page.getByText("Summary", { exact: true })).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .md" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.md$/);
  });

  test("persists generated notes across reloads", async ({ page }) => {
    await seedLectures(page, [makeLecture()]);
    await page.goto("/");
    await page
      .getByRole("button", { name: /^Operating Systems 101/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Generate notes" }).click();
    await expect(page.getByRole("button", { name: "Regenerate notes" })).toBeVisible();

    await page.reload();
    await expect(page.getByText("no notes yet")).toHaveCount(0);
  });

  test("shows the server's message when the API rejects the request", async ({ page }) => {
    await seedLectures(page, [makeLecture()]);
    await page.route("**/api/notes", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        json: {
          error: "Too many requests. Please wait a moment and try again.",
          code: "rate_limited",
        },
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: /^Operating Systems 101/ }).click();
    await page.getByRole("button", { name: "Generate notes" }).click();
    await expect(
      page.getByText("Too many requests. Please wait a moment and try again."),
    ).toBeVisible();
  });

  test("falls back to in-browser notes when the server is unreachable", async ({ page }) => {
    await seedLectures(page, [makeLecture()]);
    await page.route("**/api/notes", (route) => route.abort("failed"));
    await page.goto("/");
    await page.getByRole("button", { name: /^Operating Systems 101/ }).click();
    await page.getByRole("button", { name: "Generate notes" }).click();
    await expect(page.getByText("Notes are ready")).toBeVisible();
    await expect(page.getByText(/server: unreachable/)).toBeVisible();
  });
});

test.describe("routing and errors", () => {
  test("shows a friendly 404", async ({ page }) => {
    const res = await page.goto("/nope");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.getByRole("link", { name: "Back to the note-taker" }).click();
    await expect(page.getByRole("heading", { name: "Lectern", level: 1 })).toBeVisible();
  });
});
