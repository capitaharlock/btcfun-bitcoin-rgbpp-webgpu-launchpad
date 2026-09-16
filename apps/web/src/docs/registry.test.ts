import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DOC_PAGES, findPage, moduleKey, pageComponent } from "./registry";

const repoRoot = new URL("../../../../", import.meta.url);

describe("docs manifest", () => {
  it("names each page once", () => {
    const slugs = DOC_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has a component for every page and no page without an entry", () => {
    for (const page of DOC_PAGES) expect(typeof pageComponent(page)).toBe("function");
    const folders = Object.keys(import.meta.glob("./pages/*/index.tsx"));
    expect(folders.sort()).toEqual(DOC_PAGES.map(moduleKey).sort());
  });

  it("declares sources that exist, so the staleness check has something to compare", () => {
    for (const page of DOC_PAGES) {
      expect(page.sources.length, page.slug).toBeGreaterThan(0);
      expect(existsSync(new URL(page.page, repoRoot)), page.page).toBe(true);
      for (const source of page.sources) expect(existsSync(new URL(source, repoRoot)), source).toBe(true);
    }
  });

  it("opens on the first page and knows an unknown one", () => {
    expect(findPage(undefined)).toBe(DOC_PAGES[0]);
    expect(findPage("nope")).toBeNull();
  });
});
