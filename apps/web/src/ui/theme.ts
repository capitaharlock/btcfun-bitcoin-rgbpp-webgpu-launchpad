/* Which theme the page wears.
 *
 * Themes are CSS files that set the token contract (`theme-arcade.css`);
 * choosing one is only setting `data-theme` on <html>. The choice can come
 * from `?theme=<name>` — remembered, so a link can switch a browser for good —
 * or from what was remembered before. It is not offered in the interface:
 * arcade is the product's look, and the alternative exists to keep the
 * contract honest.
 */

export const THEMES = ["arcade", "clean"] as const;
export type ThemeName = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemeName = "arcade";

const STORAGE_KEY = "btcfun:theme:v1";

function isTheme(value: string | null | undefined): value is ThemeName {
  return THEMES.includes(value as ThemeName);
}

/** The theme to wear: a valid query choice, else a valid remembered one, else the default. */
export function resolveTheme(query: string | null, remembered: string | null): ThemeName {
  if (isTheme(query)) return query;
  if (isTheme(remembered)) return remembered;
  return DEFAULT_THEME;
}

/** Apply the theme before the first paint, and remember an explicit choice. */
export function applyTheme(root: HTMLElement = document.documentElement): ThemeName {
  const query = new URLSearchParams(window.location.search).get("theme");
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the query or the default still applies.
  }
  const theme = resolveTheme(query, remembered);
  if (isTheme(query)) {
    try {
      localStorage.setItem(STORAGE_KEY, query);
    } catch {
      // Not remembered, but applied for this visit.
    }
  }
  root.dataset.theme = theme;
  return theme;
}
