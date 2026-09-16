/* The documentation area: reachable from the footer, every page renders,
 * every diagram is an accessible image whose labels are legible, and a phone
 * can navigate it without the page scrolling sideways. */

import manifest from "../../src/docs/sources.json" with { type: "json" };
import { test, expect } from "../support/fixtures";

const PAGES = manifest.pages;

test.describe("docs", () => {
  test("the footer link opens the docs", async ({ page, app }) => {
    await app.goto("/");
    await page.locator("footer").getByRole("link", { name: "Docs" }).click();
    await expect(page).toHaveURL(/#\/docs$/);
    await expect(page.getByRole("heading", { level: 1, name: PAGES[0].title })).toBeVisible();
  });

  for (const doc of PAGES) {
    test(`${doc.slug} renders with its diagrams`, async ({ page, app }) => {
      await app.goto(`/docs/${doc.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: doc.title })).toBeVisible();
      // Read from the DOM: on a phone the contents are folded away, but still say where you are.
      await expect(page.locator('nav[aria-label="Documentation"] a[aria-current="page"]')).toHaveText(doc.title);

      const diagrams = page.locator("figure.dg svg[role=img]");
      for (const svg of await diagrams.all()) {
        await svg.scrollIntoViewIfNeeded();
        await expect(svg).toBeVisible();
        const labelledBy = (await svg.getAttribute("aria-labelledby"))!.split(" ");
        const title = await svg.locator(`title#${labelledBy[0]}`).textContent();
        expect(title?.trim().length, "diagram has a title").toBeGreaterThan(0);
        await expect(svg.locator(`desc#${labelledBy[1]}`)).not.toBeEmpty();
        expect(await svg.locator("text").count(), "diagram has labels").toBeGreaterThan(0);
      }
    });
  }

  test("the pages that explain a circuit carry its diagrams", async ({ page, app }) => {
    const expected: Record<string, number> = { mint: 4, ownership: 1, transfers: 2, market: 3 };
    for (const [slug, count] of Object.entries(expected)) {
      await app.goto(`/docs/${slug}`);
      await expect(page.locator("figure.dg svg[role=img]")).toHaveCount(count);
    }
  });

  test("every diagram label meets WCAG AA contrast against the shape behind it", async ({ page, app }) => {
    for (const doc of PAGES) {
      await app.goto(`/docs/${doc.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: doc.title })).toBeVisible();
      const failures = await page.evaluate(() => {
        // Resolve any CSS colour (color-mix, oklab…) to sRGB by painting it.
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        const rgb = (color: string) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
          return [r, g, b];
        };
        const luminance = ([r, g, b]: number[]) => {
          const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
          return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        };
        const out: string[] = [];
        for (const text of Array.from(document.querySelectorAll("figure.dg svg text"))) {
          const surface = text.closest("[data-surface]");
          const shape = surface?.firstElementChild;
          if (!shape) {
            out.push(`no surface behind "${text.textContent}"`);
            continue;
          }
          const [a, b] = [luminance(rgb(getComputedStyle(text).fill)), luminance(rgb(getComputedStyle(shape).fill))];
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (ratio < 4.5) out.push(`"${text.textContent}" ${ratio.toFixed(2)}:1`);
        }
        return out;
      });
      expect(failures, `${doc.slug}: labels below 4.5:1`).toEqual([]);
    }
  });

  test("an unknown page says so and links back", async ({ page, app }) => {
    await app.goto("/docs/nope");
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    await page.getByRole("link", { name: "Start from the overview" }).click();
    await expect(page.getByRole("heading", { level: 1, name: PAGES[0].title })).toBeVisible();
  });

  test("the technical layer is folded until asked for", async ({ page, app }) => {
    await app.goto("/docs/mint");
    const tech = page.locator("details.docs-tech");
    await expect(tech.locator("ul")).toBeHidden();
    await tech.locator("summary").click();
    await expect(tech.locator("ul")).toBeVisible();
  });

  test("docs fit the screen and navigate from the contents", async ({ page, app, isMobile }) => {
    await app.goto("/docs/mint");
    const nav = page.getByRole("navigation", { name: "Documentation" });
    if (isMobile) {
      await expect(nav).toBeHidden();
      await page.getByRole("button", { name: /Docs ·/ }).click();
    }
    await nav.getByRole("link", { name: "The market" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "The market" })).toBeVisible();
    if (isMobile) await expect(nav).toBeHidden();

    for (const doc of PAGES) {
      await app.goto(`/docs/${doc.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: doc.title })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${doc.slug} is wider than the viewport`).toBeLessThanOrEqual(1);
    }
  });
});
