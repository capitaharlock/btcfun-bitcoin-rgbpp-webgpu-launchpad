import { describe, expect, it } from "vitest";

import { at, cell } from "@/test/loop";
import { MIN_CLZ } from "@/domain/protocol";
import { narrate } from "./narration";

describe("what the page says is happening", () => {
  const ctx = { symbol: "DEMO", running: false, unfunded: false, busy: false };

  it("says what is happening now and what comes next", () => {
    expect(narrate(at({ wallet: null, miners: null }).state, ctx)).toEqual({ now: "No wallet connected", next: "Pick one — then the ticket" });
    expect(narrate(at({}).state, ctx)).toEqual({ now: "Buy the ticket", next: "Then mine at once" });
    expect(narrate(at({ miners: [cell("idle")] }).state, { ...ctx, busy: true })?.now).toBe("Signing the ticket");
    expect(narrate(at({ miners: [cell("paid")] }).state, ctx)?.next).toBe("Activate your ticket — network fee only");
    expect(narrate(at({ miners: [cell("armed")] }).state, { ...ctx, running: true })).toEqual({
      now: "Mining DEMO",
      next: `Minting unlocks at ${MIN_CLZ} zero bits`,
    });
  });

  it("puts a missing balance first", () => {
    expect(narrate(at({}).state, { ...ctx, unfunded: true })?.now).toBe("Your wallet needs bitcoin");
  });

  it("leaves a launch that is not on offer to the page", () => {
    expect(narrate(at({ launchOpen: false }).state, ctx)).toBeNull();
  });
});
