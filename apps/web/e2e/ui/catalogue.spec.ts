/* The catalogue: what the halving bar says, the simulated examples, the
 * featured DEMO launch and token pictures. */

import { test, expect } from "../support/fixtures";
import { announce, block } from "../support/flows";
import { PLATFORM_IDENTITY, PLATFORM_SECRET } from "../support/platform";

test.describe("catalogue", () => {
  test("simulated examples are badged, and none of them can be mined or followed", async ({ page, app }) => {
    await app.goto("/");
    const examples = page.locator("section", { has: page.getByRole("heading", { name: "Examples" }) });
    await expect(examples).toBeVisible();
    const cards = examples.locator(".tokencard");
    expect(await cards.count()).toBeGreaterThanOrEqual(5);
    for (const card of await cards.all()) {
      await expect(card).toHaveClass(/simulated/);
      await expect(card.getByText("Simulated", { exact: true })).toBeVisible();
      await expect(card.getByRole("button", { name: /^Mine [A-Z]+ — Example data/ })).toBeDisabled();
      // No way off the card: no page, no project, no explorer.
      await expect(card.getByRole("link")).toHaveCount(0);
      await expect(card.getByRole("img", { name: /nothing on chain/ }).first()).toBeVisible();
    }
    // Each is placed in its state, and says where it is.
    await expect(examples.locator(".tokencard", { hasText: "HOMES" })).toContainText(/Halving 2 · \d+\/1,008 blocks · rate ÷4/);
    await expect(examples.locator(".tokencard", { hasText: "KICKOFF" })).toContainText("Terminal: nothing mints after halving 42.");
    await expect(examples.locator(".tokencard", { hasText: "BREW" })).toContainText(/Opens in 90 blocks/);
  });

  test("real launches say where they are in the halving and link to the explorers", async ({ page, app, sim }) => {
    await app.createBrowserKey();
    await announce(page, { symbol: "BAR" });
    await block(page, sim, 1);
    await app.goto("/");
    const card = page.locator(".tokencard:not(.simulated)", { hasText: "BAR" });
    await expect(card).toContainText(/Halving 0 · 0\/1,008 blocks · rate ÷1/);
    await expect(card).toContainText(/Rate halves in 1,008 blocks/);
    await expect(card.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
    await expect(card.getByRole("link", { name: "BAR ticket payments on mempool" })).toHaveAttribute("href", /mempool\.space\/testnet\/address\/tb1q/);
    await expect(card.getByRole("link", { name: "BAR token on the CKB explorer" })).toHaveAttribute("href", /explorer\.nervos\.org\/xudt\/0x[0-9a-f]{64}$/);
    await expect(card.getByRole("link", { name: "Mine BAR" })).toBeEnabled();
  });

  test("the platform's DEMO launch comes first, with a lit MINE and its picture everywhere", async ({ page, app, sim }) => {
    const platform = await app.restoreKey(PLATFORM_SECRET);
    expect(platform.identity, "the test build must name the suite's platform key (playwright.config.ts)").toBe(PLATFORM_IDENTITY);
    await announce(page, { symbol: "EARLY" });
    await announce(page, { symbol: "DEMO", image: "/tokens/demo.svg" });
    await announce(page, { symbol: "LATER" });
    await block(page, sim, 1);

    await app.goto("/");
    const first = page.locator(".cardgrid").first().locator(".tokencard").first();
    await expect(first).toHaveClass(/featured/);
    await expect(first).toContainText("DEMO");
    await expect(first.getByText("Start here")).toBeVisible();
    await expect(first.getByRole("link", { name: "Mine DEMO" })).toBeVisible();
    // Examples now point at it.
    await expect(page.getByRole("button", { name: /^Mine SURF — Example data — mint the DEMO token/ })).toBeDisabled();

    // The picture, with its alternative text, on every surface the token appears on.
    const picture = (scope: ReturnType<typeof page.locator>) => scope.getByRole("img", { name: "DEMO token image" }).first();
    await expect(picture(first)).toBeVisible();
    expect(await picture(first).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await first.getByRole("link", { name: "DEMO", exact: true }).click();
    await expect(page).toHaveURL(/#\/launch\/demo-[0-9a-f]{16}$/);
    await expect(picture(page.locator(".marquee"))).toBeVisible();
    await expect(page.getByText("Image chosen by the creator")).toBeVisible();
    await app.goto("/market");
    await page.getByLabel("Token").first().selectOption({ label: "DEMO · DEMO collective" });
    await expect(picture(page.locator(".ticker"))).toBeVisible();
    await app.goto("/activity");
    await expect(picture(page.locator(".feed"))).toBeVisible();
  });

  test("a DEMO launch by anyone else is an ordinary launch", async ({ page, app, sim }) => {
    await app.createBrowserKey();
    await announce(page, { symbol: "DEMO" });
    await block(page, sim, 1);
    await app.goto("/");
    await expect(page.locator(".tokencard.featured")).toHaveCount(0);
    await expect(page.locator(".tokencard:not(.simulated)", { hasText: "DEMO" })).toBeVisible();
  });
});
