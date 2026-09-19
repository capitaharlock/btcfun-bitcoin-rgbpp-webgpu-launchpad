import { describe, expect, it } from "vitest";

import { isFeatured, type FeatureRule } from "./featured";

const rule: FeatureRule = { ids: ["pizza-df3a41ba085f0f0b"], symbol: "DEMO", platform: "02platform" };

describe("featured launches", () => {
  it("feature an id the platform lists", () => {
    expect(isFeatured({ id: "pizza-df3a41ba085f0f0b", symbol: "PIZZA", creator: "02anyone" }, rule)).toBe(true);
  });

  it("feature a DEMO launch only when the platform announced it first", () => {
    expect(isFeatured({ id: "demo-0000000000000001", symbol: "DEMO", creator: "02platform" }, rule)).toBe(true);
    expect(isFeatured({ id: "demo-0000000000000002", symbol: "DEMO", creator: "02copycat" }, rule)).toBe(false);
    expect(isFeatured({ id: "demox-000000000000003", symbol: "DEMOX", creator: "02platform" }, rule)).toBe(false);
  });

  it("feature nothing else", () => {
    expect(isFeatured({ id: "mesh-0000000000000000", symbol: "MESH", creator: "02platform" }, rule)).toBe(false);
  });
});
