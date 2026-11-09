import { test as recordingTest, type Page } from "@playwright/test";
import { expect, makeLecture, seedLectures, test } from "./fixtures";

async function moveToProject(page: Page, title: string, project: string) {
  await page.getByRole("combobox", { name: `Move ${title} to project` }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
}

test("classifies legacy recordings into projects and back to Ungrouped across reloads", async ({
  page,
}) => {
  await seedLectures(page, [makeLecture(), makeLecture({ id: "second", title: "Paging" })]);
  await page.goto("/");
  const ungrouped = page.getByRole("list", { name: "Ungrouped recordings" });
  await expect(ungrouped.getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: /^Operating Systems 101/ }).click();

  page.once("dialog", (dialog) => dialog.accept("Systems"));
  await moveToProject(page, "Operating Systems 101", "New project…");
  const project = page.getByRole("group", { name: "Project Systems", exact: true }).locator("ul");
  await expect(page.getByRole("button", { name: "Toggle Systems recordings" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.getByRole("button", { name: "Toggle Systems recordings" }).click();
  await expect(project.getByRole("button", { name: /^Operating Systems 101/ })).toBeVisible();
  await moveToProject(page, "Paging", "Systems");
  await expect(project.getByRole("listitem")).toHaveCount(2);

  await page.reload();
  await expect(project).not.toBeVisible();
  await page.getByRole("button", { name: "Toggle Systems recordings" }).click();
  await expect(project.getByRole("listitem")).toHaveCount(2);

  // Cancelling folder creation keeps the recording in its existing project.
  page.once("dialog", (dialog) => dialog.dismiss());
  await moveToProject(page, "Paging", "New project…");
  await page.getByRole("combobox", { name: "Move Paging to project" }).click();
  await expect(page.getByRole("option", { name: "Systems", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Escape");
  await moveToProject(page, "Operating Systems 101", "Ungrouped");
  await expect(ungrouped.getByRole("button", { name: /^Operating Systems 101/ })).toBeVisible();
  await page.reload();
  await expect(ungrouped.getByRole("listitem")).toHaveCount(1);
  await expect(project.locator("li")).toHaveCount(1);
});

test("opens a project independently of its arrow and renames its history", async ({ page }) => {
  await seedLectures(page, [
    makeLecture({ project: "Systems" }),
    makeLecture({ id: "second", title: "Paging", project: "Systems" }),
    makeLecture({ id: "other", project: "Other" }),
    makeLecture({ id: "legacy", title: "Legacy recording" }),
  ]);
  await page.goto("/");
  const sidebar = page.locator("aside");
  const main = page.locator("main");
  const toggle = sidebar.getByRole("button", { name: "Toggle Systems recordings" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    sidebar.getByRole("button", { name: "Toggle Ungrouped recordings" }),
  ).toHaveAttribute("aria-expanded", "true");
  await sidebar.getByRole("button", { name: "Systems", exact: true }).click();
  await expect(main.getByRole("heading", { name: "Systems", exact: true })).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const history = main.getByRole("region", { name: "Project history" });
  await expect(history.getByRole("button")).toHaveCount(2);
  await toggle.click();
  await expect(history).toBeVisible();

  await main.getByRole("button", { name: "Rename project" }).click();
  await main.getByRole("textbox", { name: "Project name" }).fill("Other");
  await main.getByRole("button", { name: "Save project name" }).click();
  await expect(page.getByText("A project with that name already exists.")).toBeVisible();
  await main.getByRole("textbox", { name: "Project name" }).fill("Operating Systems");
  await main.getByRole("button", { name: "Save project name" }).click();
  await expect(main.getByRole("heading", { name: "Operating Systems", exact: true })).toBeVisible();
  await expect(history.getByRole("button")).toHaveCount(2);
  await history.getByRole("button", { name: /^Paging/ }).click();
  await expect(main.getByRole("button", { name: "Generate notes" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Operating Systems", exact: true })).toBeVisible();
  await main.getByRole("button", { name: "All recordings" }).click();
  await expect(main.getByRole("button", { name: "Record", exact: true })).toBeVisible();
  await page.reload();
  await sidebar.getByRole("button", { name: "Operating Systems", exact: true }).click();
  await expect(history.getByRole("button")).toHaveCount(2);
});

// The blocked transcription deliberately logs errors; exercise the real recorder and saved audio.
recordingTest("new recordings inherit the current project", async ({ page }) => {
  await seedLectures(page, [makeLecture({ project: "Systems" })]);
  await page.addInitScript(() =>
    localStorage.setItem(
      "stt.session-options.v1",
      JSON.stringify({ liveEnabled: false, engineChoice: "offline" }),
    ),
  );
  await page.route("**/api/transcribe**", (route) => route.abort());
  await page.goto("/");
  await page.locator("aside").getByRole("button", { name: "Systems", exact: true }).click();
  await page.getByRole("button", { name: "New recording" }).click();
  await expect(
    page.locator("main").getByRole("heading", { name: "Systems", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByRole("button", { name: /Stop & make notes/ })).toBeVisible();
  await page.waitForTimeout(2500); // let the real MediaRecorder capture an audio part
  await page.getByRole("button", { name: /Stop & make notes/ }).click();
  await expect(page.getByText(/audio on this device/)).toBeVisible({ timeout: 30_000 });
  const grouped = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("stt.lectures.v1") ?? "[]").filter(
        (lecture: { project?: string }) => lecture.project === "Systems",
      ).length,
  );
  expect(grouped).toBe(2);
  await page.reload();
  await page.locator("aside").getByRole("button", { name: "Systems", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Project history" }).getByRole("button"),
  ).toHaveCount(2);
});
