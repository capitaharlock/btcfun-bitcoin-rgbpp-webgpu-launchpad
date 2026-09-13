/* The public feed: signed announcements and listings, checked on arrival. */

import { test, expect } from "../support/fixtures";
import { announce, demoKeyOn, secondVisitor } from "../support/flows";

test.describe("activity", () => {
  test("an announcement reaches another browser through the index", async ({ page, app, sim, rgbpp, browser, ux }) => {
    await app.createDemoKey();
    await announce(page, { symbol: "NEWS" });
    expect(rgbpp.events.filter((e) => e.signed.body.kind === "launch")).toHaveLength(1);

    const other = await secondVisitor(browser, sim, rgbpp);
    await demoKeyOn(other);
    await other.goto("/#/");
    await expect(other.locator(".tokencard").filter({ hasText: "NEWS" }).first()).toBeVisible({ timeout: 60_000 });
    await other.goto("/#/activity");
    await expect(other.getByText("NEWS").first()).toBeVisible();
    await other.context().close();
    ux.note("A launch announced in one browser appears in another's catalogue after the index poll.");
  });

  test("an announcement whose terms were altered in the index is dropped", async ({ page, app, sim, rgbpp, browser }) => {
    await app.createDemoKey();
    await announce(page, { symbol: "EDIT" });
    const event = rgbpp.events.find((e) => e.signed.body.kind === "launch")!;
    const meta = JSON.parse(event.signed.body.meta!);
    event.signed.body.meta = JSON.stringify({ ...meta, h0: meta.h0 - 100 });

    const other = await secondVisitor(browser, sim, rgbpp);
    await other.goto("/#/");
    await expect(other.getByText("No launches have been announced yet.")).toBeVisible({ timeout: 60_000 });
    await other.context().close();
  });
});
