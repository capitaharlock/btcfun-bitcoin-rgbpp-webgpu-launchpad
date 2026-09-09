/* The public feed: what it shows after you act, and what it admits it is. */

import { test, expect } from "../support/fixtures";
import { claimOnce, fundedWallet } from "../support/flows";

test.describe("activity", () => {
  // These journeys start by mining a claim; on a machine without WebGPU that
  // falls back to the CPU, whose time to 24 zero bits has a long tail.
  test.describe.configure({ timeout: 240_000 });
  test("with no index, the feed says it is local and still shows your own actions", async ({
    page,
    app,
    sim,
    ux,
  }) => {
    await app.pinOrigin("mesh", sim.tip - 3);
    await fundedWallet(app, sim);
    await app.goto("/launch/mesh");
    await claimOnce(page);

    await app.goto("/activity");
    await expect(page.getByText("local only")).toBeVisible();
    const row = page.locator(".feedrow").filter({ hasText: "mined" }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("MESH");
    await expect(row.getByText("you", { exact: true })).toBeVisible();
    await expect(row.getByText("signature failed")).toHaveCount(0);
    ux.note("Without an index the feed labels itself 'local only' and still lists the visitor's own mint, marked 'you'.");
  });

  test("the feed calls its figures announcements, not receipts", async ({ page, app }) => {
    await app.goto("/activity");
    await expect(page.getByRole("heading", { name: "Announcements, not receipts" })).toBeVisible();
    await expect(page.getByText("sats named")).toBeVisible();
  });

  test("a tampered event in local storage is shown as failing its signature", async ({ page, app, sim }) => {
    await app.pinOrigin("mesh", sim.tip - 3);
    await fundedWallet(app, sim);
    await app.goto("/launch/mesh");
    await claimOnce(page);

    await page.evaluate(() => {
      const key = "btcfun:activity:v1";
      const entries = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{
        signed: { body: { amount: string } };
      }>;
      entries[0].signed.body.amount = "999999999999999";
      localStorage.setItem(key, JSON.stringify(entries));
    });
    await app.goto("/activity");
    await page.reload();
    await expect(page.getByText("signature failed").first()).toBeVisible();
  });
});
