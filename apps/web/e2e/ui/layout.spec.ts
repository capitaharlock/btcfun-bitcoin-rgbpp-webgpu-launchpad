/* Every section fits the screen it is opened on — desktop and phone. */

import { test, expect } from "../support/fixtures";

const ROUTES = ["/", "/create", "/market", "/activity", "/holdings", "/wallet", "/lab", "/proof"];

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
    await app.createDemoKey();
    for (const route of ["/", "/market", "/activity"]) {
      await app.goto(route);
      await expect(page.locator("main")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} is wider than the viewport`).toBeLessThanOrEqual(1);
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
