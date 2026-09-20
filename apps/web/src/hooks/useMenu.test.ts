import { describe, expect, it } from "vitest";

import { menuMove } from "./useMenu";

describe("menu keys", () => {
  it("arrows move one item and wrap at both ends", () => {
    expect(menuMove("ArrowDown", 0, 4)).toBe(1);
    expect(menuMove("ArrowDown", 3, 4)).toBe(0);
    expect(menuMove("ArrowUp", 1, 4)).toBe(0);
    expect(menuMove("ArrowUp", 0, 4)).toBe(3);
  });

  it("Home and End jump to the ends", () => {
    expect(menuMove("Home", 2, 4)).toBe(0);
    expect(menuMove("End", 0, 4)).toBe(3);
  });

  it("starts from the right end when no item has the focus yet", () => {
    expect(menuMove("ArrowDown", -1, 4)).toBe(0);
    expect(menuMove("ArrowUp", -1, 4)).toBe(3);
  });

  it("ignores other keys and empty menus", () => {
    expect(menuMove("a", 0, 4)).toBeNull();
    expect(menuMove("Enter", 0, 4)).toBeNull();
    expect(menuMove("ArrowDown", 0, 0)).toBeNull();
  });
});
