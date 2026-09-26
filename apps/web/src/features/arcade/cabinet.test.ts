import { describe, expect, it } from "vitest";

import { menuCommand } from "./cabinet/keyboard";

describe("menu keys", () => {
  it("Escape leaves the game from every screen", () => {
    for (const phase of ["intro", "playing", "dying", "paused", "over"] as const) {
      expect(menuCommand("Escape", phase), phase).toBe("exit");
    }
  });

  it("P pauses a running game and resumes a paused one", () => {
    for (const phase of ["intro", "playing", "dying"] as const) {
      expect(menuCommand("p", phase), phase).toBe("pause");
      expect(menuCommand("P", phase), phase).toBe("pause");
    }
    expect(menuCommand("p", "paused")).toBe("resume");
  });

  it("a finished game has nothing to pause, and other keys are not menu keys", () => {
    expect(menuCommand("p", "over")).toBeNull();
    expect(menuCommand("Enter", "playing")).toBeNull();
    expect(menuCommand(" ", "paused")).toBeNull();
  });
});
