/* The front page's arcade can be picked up and played with the keyboard,
 * without the page scrolling under the player. */

import type { Page } from "@playwright/test";
import { test, expect, type App } from "../support/fixtures";
import { announce } from "../support/flows";

/** The front page with one launch in the formation: every invader is a real launch, so a game needs one. */
async function withLaunch(page: Page, app: App): Promise<void> {
  await app.createBrowserKey();
  await announce(page, { symbol: "ARCD" });
  await app.goto("/");
  await expect(page.locator(".arcade canvas")).toHaveAttribute("aria-label", /1 launch as invaders/, { timeout: 20_000 });
}

test.describe("arcade", () => {
  test("focus, start, move and fire: the score counts and the page stays put", async ({ page, app }) => {
    await withLaunch(page, app);
    const stage = page.locator(".arcade");
    const game = stage.getByRole("application");
    const status = stage.getByRole("status");
    await expect(stage).toHaveAttribute("data-mode", "attract");
    await expect(stage.getByText("← → move · SPACE fire · P pause")).toBeVisible();

    await game.focus();
    await expect(stage).toHaveAttribute("data-mode", "ready");
    await expect(status).toHaveText(/Press Space to start/);

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Space");
    await expect(stage).toHaveAttribute("data-mode", "playing");
    await expect(status).toHaveText("Score 0. Lives 3. Wave 1.");
    await expect(game).toHaveAttribute("aria-label", /arrows move, Space fires/);

    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(150);
    await page.keyboard.up("ArrowLeft");

    // Hold fire: one hash in flight at a time, re-fired as each one lands.
    await page.keyboard.down("Space");
    await expect(status).toHaveText(/^Score [1-9][\d,]*\. Lives \d\. Wave 1\.$/, { timeout: 20_000 });
    await page.keyboard.up("Space");
    for (let i = 0; i < 5; i++) await page.keyboard.press("Space");
    expect(await page.evaluate(() => window.scrollY), "Space scrolled the page during a game").toBe(scrollBefore);

    await page.keyboard.press("p");
    await expect(stage).toHaveAttribute("data-mode", "paused");
    await expect(status).toHaveText(/^Paused\. Score [1-9]/);
    await page.keyboard.press("p");
    await expect(stage).toHaveAttribute("data-mode", "playing");

    // Leaving the game pauses it; keys elsewhere go to the page again.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await expect(stage).toHaveAttribute("data-mode", "paused");
  });

  test("a hi-score is remembered on this device", async ({ page, app }) => {
    await app.seedStorage({ "btcfun:arcade:hi": "4321" });
    await withLaunch(page, app);
    await page.locator(".arcade").getByRole("application").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".arcade").getByRole("status")).toHaveText("Score 0. Lives 3. Wave 1.");
    await page.keyboard.press("p");
    await expect(page.locator(".arcade")).toHaveAttribute("data-mode", "paused");
    await expect(page.locator(".arcade").getByRole("status")).toHaveText(/Hi-score 4,321\./);
  });

  test("Escape leaves the game for the attract mode, and so does the Exit button", async ({ page, app }) => {
    await withLaunch(page, app);
    const stage = page.locator(".arcade");
    const game = stage.getByRole("application");
    const exit = stage.getByRole("button", { name: "Exit" });
    await expect(exit).toHaveCount(0);

    await game.focus();
    await page.keyboard.press("Enter");
    await expect(stage).toHaveAttribute("data-mode", "playing");
    await expect(exit).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(stage).toHaveAttribute("data-mode", "attract");
    await expect(game).not.toBeFocused();
    await expect(exit).toHaveCount(0);
    // The focus lands on Play, so the keyboard can start again from where it was.
    await expect(stage.getByRole("button", { name: "Play" })).toBeFocused();

    // Paused, the button still leaves; the game does not resume on the way out.
    await game.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("p");
    await expect(stage).toHaveAttribute("data-mode", "paused");
    await exit.click();
    await expect(stage).toHaveAttribute("data-mode", "attract");
    await expect(exit).toHaveCount(0);
  });

  test("with no launch yet there is nothing to play, and nothing breaks", async ({ page, app }) => {
    await app.goto("/");
    const stage = page.locator(".arcade");
    await expect(stage.getByRole("button", { name: "Play" })).toHaveCount(0);
    await stage.getByRole("application").focus();
    await page.keyboard.press("Space");
    await expect(stage).not.toHaveAttribute("data-mode", "playing");
  });

  test("sound is off until switched on", async ({ page, app }) => {
    await app.goto("/");
    const toggle = page.locator(".arcade").getByRole("button", { name: /Sound/ });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("btcfun:arcade:sound"))).toBe("on");
  });
});
