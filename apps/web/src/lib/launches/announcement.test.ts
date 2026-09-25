import { describe, expect, it } from "vitest";

import { meshDraft as draft, TEST_CREATOR as creator, certifiedFor } from "../../test/launches";
import { deriveKey } from "../bitcoin/keys";
import { TESTNET3 } from "../bitcoin/network";
import { ACTIVE_RGBPP } from "../rgbpp/config";
import { tokenId } from "../rgbpp/launch";
import { commitmentId, idMatches, LAUNCH_ID_PATTERN, termsOf } from "./announcement";
import { NO_LINKS } from "./draft";

describe("launch identity", () => {
  const c = certifiedFor(draft, creator, 150_000, TESTNET3);

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
    expect(certifiedFor({ ...draft, accent: "var(--cyan)" }, creator, 150_000, TESTNET3).tokenId).toBe(c.tokenId);
  });
});

describe("launch extras in the announcement", () => {
  it("are optional, and leave an announcement without them exactly as before", () => {
    const plain = certifiedFor(draft, creator, 150_000, TESTNET3);
    expect("links" in plain).toBe(false);
    expect("story" in plain).toBe(false);
    expect("image" in plain).toBe(false);
    const withExtras = certifiedFor(
      { ...draft, links: { ...NO_LINKS, x: "@meshwork" }, story: { why: "Relays cost money.", plan: "" } },
      creator,
      150_000,
      TESTNET3,
    );
    expect(withExtras.links).toEqual({ x: "https://x.com/meshwork" });
    expect(withExtras.story).toEqual({ why: "Relays cost money." });
    // Not part of the token: the id does not move.
    expect(withExtras.tokenId).toBe(plain.tokenId);
    expect(withExtras.id).toBe(plain.id);
    // But part of what the creator signed.
    expect(commitmentId({ ...withExtras, at: plain.at })).not.toBe(commitmentId(plain));
    expect(commitmentId({ ...plain, links: undefined, story: undefined })).toBe(commitmentId(plain));
  });
});
