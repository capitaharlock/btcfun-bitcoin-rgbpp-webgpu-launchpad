import { describe, expect, it } from "vitest";

import { deriveKey } from "../bitcoin/keys";
import { TESTNET3 } from "../bitcoin/network";
import { ACTIVE_RGBPP } from "../rgbpp/config";
import { tokenId } from "../rgbpp/launch";
import { commitmentFor, idMatches, LAUNCH_ID_PATTERN, termsOf, validate, type LaunchDraft } from "./create";

const promoter = deriveKey(new Uint8Array(32).fill(7), TESTNET3).address;
const draft: LaunchDraft = {
  symbol: "MESH",
  name: "Meshwork",
  blurb: "Community token for a mesh-relay operators' group.",
  accent: "var(--amber)",
  promoter,
  opensInBlocks: 6,
};

describe("launch drafts", () => {
  it("accept a complete draft and name each fault in place", () => {
    expect(validate(draft, TESTNET3)).toEqual({});
    const faults = validate(
      { ...draft, symbol: "m", name: "x", blurb: "short", promoter: "bc1qnotthisnetwork", opensInBlocks: 0 },
      TESTNET3,
    );
    expect(Object.keys(faults).sort()).toEqual(["blurb", "name", "opensInBlocks", "promoter", "symbol"]);
  });

  it("refuse an address that decodes on the wrong network or not at all", () => {
    expect(validate({ ...draft, promoter: "tb1qnotanaddress" }, TESTNET3).promoter).toBeDefined();
  });
});

describe("launch identity", () => {
  const c = commitmentFor(draft, "02" + "11".repeat(32), 150_000, TESTNET3);

  it("derives the id from the token its terms produce", () => {
    expect(c.h0).toBe(150_006);
    expect(c.tokenId).toBe(tokenId(ACTIVE_RGBPP, termsOf(c, TESTNET3)));
    expect(c.id).toBe(`mesh-${c.tokenId.slice(2, 18)}`);
    expect(LAUNCH_ID_PATTERN.test(c.id)).toBe(true);
    expect(idMatches(c, TESTNET3)).toBe(true);
  });

  it("stops matching when any term is changed after the fact", () => {
    expect(idMatches({ ...c, h0: c.h0 + 1 }, TESTNET3)).toBe(false);
    expect(idMatches({ ...c, name: "Other" }, TESTNET3)).toBe(false);
    expect(idMatches({ ...c, promoter: deriveKey(new Uint8Array(32).fill(8), TESTNET3).address }, TESTNET3)).toBe(false);
    expect(idMatches({ ...c, promoter: "not an address" }, TESTNET3)).toBe(false);
  });

  it("does not depend on presentation: the accent is not part of the token", () => {
    expect(commitmentFor({ ...draft, accent: "var(--cyan)" }, "02" + "11".repeat(32), 150_000, TESTNET3).tokenId).toBe(c.tokenId);
  });
});
