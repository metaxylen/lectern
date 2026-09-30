import { test as plainTest } from "@playwright/test";
import { expect, test } from "./fixtures";

test.describe("audio source", () => {
  test("offers microphone, tab audio and tab + microphone", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Audio source").click();
    await expect(page.getByRole("option", { name: "Microphone", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: /Browser tab or screen audio/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /Tab audio \+ my microphone/ })).toBeVisible();
  });

  test("explains how to capture tab and system audio", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Also share tab audio")).toHaveCount(0);
    await page.getByLabel("Audio source").click();
    await page.getByRole("option", { name: /^Browser tab or screen audio/ }).click();
    await expect(page.getByText("Also share tab audio")).toBeVisible();
    await expect(page.getByText(/BlackHole/)).toBeVisible();
    // A microphone device only matters for microphone sources.
    await expect(page.getByLabel("Microphone", { exact: true })).toHaveCount(0);
    await page.getByLabel("Audio source").click();
    await page.getByRole("option", { name: /Tab audio \+ my microphone/ }).click();
    await expect(page.getByLabel("Microphone", { exact: true })).toBeVisible();
  });

  test("live transcript is on by default and can be turned off", async ({ page }) => {
    await page.goto("/");
    const live = page.getByRole("checkbox", { name: /Live transcript/ });
    await expect(live).toBeChecked();
    await live.uncheck();
    await expect(live).not.toBeChecked();
  });

  test("sharing nothing is explained, not treated as a crash", async ({ page }) => {
    await page.addInitScript(() => {
      // A display capture that has no audio track, like sharing a window without sound.
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 16;
        return canvas.captureStream(1);
      };
    });
    await page.goto("/");
    await page.getByLabel("Audio source").click();
    await page.getByRole("option", { name: /^Browser tab or screen audio/ }).click();
    await page.getByRole("button", { name: "Record" }).click();
    await expect(page.getByText("Audio source problem")).toBeVisible();
    await expect(page.getByText(/Also share tab audio/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Record" })).toBeEnabled();
  });

  test("closing the share picker is not an error", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        throw new DOMException("dismissed", "NotAllowedError");
      };
    });
    await page.goto("/");
    await page.getByLabel("Audio source").click();
    await page.getByRole("option", { name: /^Browser tab or screen audio/ }).click();
    await page.getByRole("button", { name: "Record" }).click();
    await expect(page.getByRole("button", { name: "Record" })).toBeEnabled();
    await expect(page.getByText("Audio source problem")).toHaveCount(0);
  });

  // Plain test: the blocked model download logs errors on purpose.
  plainTest(
    "tab audio with no microphone records and ends cleanly when sharing stops",
    async ({ page }) => {
      await page.addInitScript(() => {
        // A display capture with real (synthetic) audio that the test can "stop sharing".
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const dest = ctx.createMediaStreamDestination();
        osc.connect(dest);
        osc.start();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 16;
        (window as unknown as { __shared: MediaStream }).__shared = new MediaStream([
          ...canvas.captureStream(1).getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);
        navigator.mediaDevices.getDisplayMedia = async () => {
          await ctx.resume(); // audio contexts start suspended until a user gesture
          return (window as unknown as { __shared: MediaStream }).__shared;
        };
      });
      await page.route(/huggingface\.co|hf\.co|jsdelivr/, (route) => route.abort());
      await page.goto("/");
      await page.getByLabel("Audio source").click();
      await page.getByRole("option", { name: /^Browser tab or screen audio/ }).click();
      await page.getByRole("button", { name: "Record" }).click();
      await expect(page.getByRole("button", { name: /Stop & make notes/ })).toBeVisible();
      await expect(page.getByText(/Shared tab audio/).first()).toBeVisible();
      await page.waitForTimeout(3000);

      // The user clicks "Stop sharing" in the browser: the recording must end on its own.
      await page.evaluate(() => {
        (window as unknown as { __shared: MediaStream }).__shared
          .getAudioTracks()
          .forEach((t) => t.dispatchEvent(new Event("ended")));
      });
      await expect(page.getByText(/The audio source stopped/)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "Record" })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/audio on this device/)).toBeVisible({ timeout: 30_000 });
    },
  );
});
