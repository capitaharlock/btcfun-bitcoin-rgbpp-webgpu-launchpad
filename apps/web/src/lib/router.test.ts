import { describe, expect, it } from "vitest";

import { canonicalHash, parse } from "./router";

describe("parse", () => {
  it("falls back to the launches for an empty or unknown hash", () => {
    expect(parse("")).toEqual({ name: "launches" });
    expect(parse("#/")).toEqual({ name: "launches" });
    expect(parse("#/nowhere")).toEqual({ name: "launches" });
    // A launch without an id is not a launch page.
    expect(parse("#/launch")).toEqual({ name: "launches" });
  });

  it("reads a launch, and whether it was reached from a MINE button", () => {
    expect(parse("#/launch/mesh-ab12")).toEqual({ name: "launch", id: "mesh-ab12", mine: false });
    expect(parse("#/launch/mesh-ab12/mine")).toEqual({ name: "launch", id: "mesh-ab12", mine: true });
  });

  it("reads the sections, with or without the leading slash", () => {
    expect(parse("#/create")).toEqual({ name: "create" });
    expect(parse("#market")).toEqual({ name: "market" });
    expect(parse("#/activity/")).toEqual({ name: "activity" });
    expect(parse("#/lab")).toEqual({ name: "lab" });
  });

  it("carries the optional proof txid and docs page", () => {
    expect(parse("#/proof")).toEqual({ name: "proof", txid: undefined });
    expect(parse("#/proof/ff00")).toEqual({ name: "proof", txid: "ff00" });
    expect(parse("#/docs")).toEqual({ name: "docs", page: undefined });
    expect(parse("#/docs/market")).toEqual({ name: "docs", page: "market" });
  });

  it("reads the wallet tabs, defaulting to the overview", () => {
    expect(parse("#/wallet")).toEqual({ name: "wallet", tab: "overview" });
    expect(parse("#/wallet/tokens")).toEqual({ name: "wallet", tab: "tokens" });
    expect(parse("#/wallet/activity")).toEqual({ name: "wallet", tab: "activity" });
    expect(parse("#/wallet/else")).toEqual({ name: "wallet", tab: "overview" });
  });

  it("keeps the retired holdings page working as the wallet's tokens tab", () => {
    expect(parse("#/holdings")).toEqual({ name: "wallet", tab: "tokens" });
  });
});

describe("canonicalHash", () => {
  it("rewrites the retired holdings route", () => {
    expect(canonicalHash("#/holdings")).toBe("#/wallet/tokens");
    expect(canonicalHash("#holdings/")).toBe("#/wallet/tokens");
  });

  it("leaves every current route alone", () => {
    expect(canonicalHash("#/wallet/tokens")).toBeNull();
    expect(canonicalHash("#/holdings/extra")).toBeNull();
    expect(canonicalHash("")).toBeNull();
  });
});
