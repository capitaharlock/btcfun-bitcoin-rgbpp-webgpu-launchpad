/* Can a first-time visitor find their way around without anything breaking? */

import { test, expect } from "../support/fixtures";

const SECTIONS = [
  { route: "/", heading: /Launches|launch/i },
  { route: "/create", heading: /Launch your own/i },
  { route: "/market", heading: /Offers/i },
  { route: "/activity", heading: /What people are/i },
  { route: "/holdings", heading: /Holdings/i },
  { route: "/wallet", heading: /wallet|passkey|demo key/i },
  { route: "/lab", heading: /emission|lab|schedule/i },
  { route: "/launch/mesh", heading: /MESH/ },
  { route: "/launch/mesh/proof", heading: /proof|MESH/i },
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
    await app.goto("/launch/mesh");
    await expect(page.getByRole("heading", { name: "MESH" })).toBeVisible();
    ux.note("With the Bitcoin provider down the app still renders every page from its fallback height.");
  });
});
