/* Can a first-time visitor find their way around without anything breaking? */

import { test, expect } from "../support/fixtures";

const SECTIONS = [
  { route: "/", heading: /Tokens you/i },
  { route: "/create", heading: /Launch your own/i },
  { route: "/market", heading: /Buy and sell/i },
  { route: "/activity", heading: /What people are/i },
  { route: "/wallet", heading: /wallet|keys/i },
  { route: "/lab", heading: /One set of rules/i },
  { route: "/proof", heading: /Verify a/i },
];

test.describe("navigation", () => {
  for (const { route, heading } of SECTIONS) {
    test(`renders ${route} without errors`, async ({ page, app }) => {
      await app.goto(route);
      await expect(page.getByRole("heading").filter({ hasText: heading }).first()).toBeVisible();
    });
  }

  test("the four main sections are in the header, in order", async ({ page, app }) => {
    await app.goto("/");
    const nav = page.getByRole("navigation").first();
    const labels = (await nav.getByRole("link").allInnerTexts()).map((t) => t.trim());
    expect(labels.slice(0, 4)).toEqual(["Launches", "Create", "Market", "Activity"]);
  });

  test("the chain tip shown in the header is the provider's", async ({ page, app, sim }) => {
    sim.tip = 151_234;
    await app.goto("/");
    await expect(page.getByText("151,234").first()).toBeVisible();
  });

  test("an empty catalogue says so and points at creation, with no invented launches", async ({ page, app, ux }) => {
    await app.goto("/");
    await expect(page.getByText("No launches have been announced yet.")).toBeVisible();
    await expect(page.locator(".tokencard")).toHaveCount(0);
    ux.note("With nothing announced the front page shows no sample launches, only the way to create the first.");
  });

  test("an unknown launch says so instead of rendering an empty page", async ({ page, app }) => {
    await app.goto("/launch/nope-0000000000000000");
    await expect(page.getByText("Launch not found")).toBeVisible();
    await page.getByRole("button", { name: /Back/ }).click();
    await expect(page).toHaveURL(/#\/?$/);
  });

  test("an unknown route falls back to the front page", async ({ page, app }) => {
    await app.goto("/this-does-not-exist");
    await expect(page.getByRole("heading", { name: "All launches" })).toBeVisible();
  });

  test("a provider outage degrades the header, not the app", async ({ page, app, sim, ux }) => {
    sim.outage = 503;
    await app.goto("/");
    await expect(page.getByRole("heading", { name: "All launches" })).toBeVisible();
    await app.goto("/lab");
    await expect(page.getByRole("heading", { name: /One set of rules/ })).toBeVisible();
    ux.note("With the Bitcoin provider down every page still renders; the header waits for the tip.");
  });
});
