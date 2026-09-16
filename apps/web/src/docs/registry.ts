/* The docs pages, in reading order.
 *
 * `sources.json` is the single list of pages: the view builds its navigation
 * from it and `scripts/docs-check.mjs` reads it to decide which pages are
 * stale. A page's component is the default export of `index.tsx` in the folder
 * the manifest names, so adding a page is one manifest entry and one folder.
 */

import type { ComponentType } from "react";

import manifest from "./sources.json";

export interface DocPage {
  slug: string;
  title: string;
  summary: string;
  /** The page's folder, relative to the repository root. */
  page: string;
  /** Files whose behaviour the page describes, relative to the repository root. */
  sources: string[];
}

export const DOC_PAGES: readonly DocPage[] = manifest.pages;

const PAGES_ROOT = "apps/web/src/docs/";

/** The `import.meta.glob` key of a page's component. */
export function moduleKey(page: DocPage): string {
  if (!page.page.startsWith(PAGES_ROOT)) throw new Error(`docs page outside ${PAGES_ROOT}: ${page.page}`);
  return `./${page.page.slice(PAGES_ROOT.length)}/index.tsx`;
}

const modules = import.meta.glob<{ default: ComponentType }>("./pages/*/index.tsx", { eager: true });

export function pageComponent(page: DocPage): ComponentType {
  const module = modules[moduleKey(page)];
  if (!module) throw new Error(`docs page ${page.slug} has no component at ${moduleKey(page)}`);
  return module.default;
}

export function findPage(slug: string | undefined): DocPage | null {
  if (!slug) return DOC_PAGES[0];
  return DOC_PAGES.find((p) => p.slug === slug) ?? null;
}
