/* Every section fits the screen it is opened on — desktop and phone. */

import { test, expect } from "../support/fixtures";

const ROUTES = ["/", "/create", "/market", "/activity", "/wallet", "/wallet/tokens", "/wallet/activity", "/holdings", "/lab", "/proof"];

async function overflowOf(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("layout", () => {
  for (const route of ROUTES) {
    test(`${route} has no horizontal scroll`, async ({ page, app }) => {
      await app.goto(route);
      await expect(page.locator("main")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(1);
    });
  }

  test("the top bar fits a phone with a wallet connected", async ({ page, app }) => {
    await app.createBrowserKey();
    for (const route of ["/", "/market", "/activity"]) {
      await app.goto(route);
      await expect(page.locator("main")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} is wider than the viewport`).toBeLessThanOrEqual(1);
    }
  });

  test("the top bar fits a phone with the demo wallet, and names it", async ({ page, app }) => {
    await app.connectDemoWallet();
    for (const route of ["/", "/market", "/wallet", "/wallet/tokens", "/wallet/activity"]) {
      await app.goto(route);
      await expect(page.locator("main")).toBeVisible();
      expect(await overflowOf(page), `${route} is wider than the viewport`).toBeLessThanOrEqual(1);
    }
    const pill = page.getByRole("banner").getByRole("button", { name: /Demo wallet/ });
    await expect(pill).toBeVisible();
    const box = await pill.boundingBox();
    const width = page.viewportSize()!.width;
    expect(box && box.x + box.width, "the wallet button is cut off").toBeLessThanOrEqual(width);

    // Its menu opens on the screen, whole, with the way out in reach of a thumb.
    await pill.click();
    const menu = page.getByRole("banner").getByRole("menu", { name: "Demo wallet" });
    const panel = (await menu.locator("..").boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(width);
    await expect(menu.getByRole("menuitem", { name: "Log out" })).toBeInViewport();
  });

  test("the connect chooser fits the screen it opens on", async ({ page, app }) => {
    await app.goto("/");
    await page.getByRole("banner").getByRole("button", { name: "Connect wallet" }).click();
    const dialog = page.getByRole("dialog", { name: "Connect a wallet" });
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    for (const name of ["Connect with a passkey", "Use the demo wallet"]) {
      const button = dialog.getByRole("button", { name });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport();
    }
  });

  test("the four sections stay reachable", async ({ page, app }) => {
    await app.goto("/");
    for (const label of ["Launches", "Create", "Market", "Activity"]) {
      const link = page.getByRole("navigation").first().getByRole("link", { name: label });
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeVisible();
    }
  });
});
