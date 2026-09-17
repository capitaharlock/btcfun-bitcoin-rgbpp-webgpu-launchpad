import { describe, expect, it } from "vitest";

import { DEFAULT_THEME, resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("prefers a valid query, then a valid remembered choice, then the default", () => {
    expect(resolveTheme("clean", "arcade")).toBe("clean");
    expect(resolveTheme(null, "clean")).toBe("clean");
    expect(resolveTheme(null, null)).toBe(DEFAULT_THEME);
  });

  it("ignores names that are not themes, wherever they come from", () => {
    expect(resolveTheme("neon-pink", "clean")).toBe("clean");
    expect(resolveTheme("", "<script>")).toBe(DEFAULT_THEME);
  });
});
