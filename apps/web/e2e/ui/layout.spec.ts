/* Every section fits the screen it is opened on — desktop and phone. */

import { test, expect } from "../support/fixtures";

const ROUTES = ["/", "/create", "/market", "/activity", "/holdings", "/wallet", "/launch/mesh", "/launch/mesh/proof"];

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

  test("the four sections stay reachable", async ({ page, app }) => {
    await app.goto("/");
    for (const label of ["Launches", "Create", "Market", "Activity"]) {
      const link = page.getByRole("navigation").first().getByRole("link", { name: label });
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeVisible();
    }
  });
});
