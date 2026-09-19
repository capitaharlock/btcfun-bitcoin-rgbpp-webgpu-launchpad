import { describe, expect, it } from "vitest";

import { deriveKey } from "../bitcoin/keys";
import { TESTNET3 } from "../bitcoin/network";
import { ACTIVE_RGBPP } from "../rgbpp/config";
import { tokenId } from "../rgbpp/launch";
import { ACTIVITY_VERSION } from "../activity";
import { MAX_META } from "../activity/verify";
import {
  commitmentFor,
  commitmentId,
  EXTRAS_WIRE_BUDGET,
  idMatches,
  LAUNCH_ID_PATTERN,
  linkFor,
  MAX_LINK_LENGTH,
  MAX_STORY_LENGTH,
  NO_LINKS,
  NO_STORY,
  publicExtras,
  termsOf,
  validate,
  type LaunchDraft,
} from "./create";
import { MAX_IMAGE_LENGTH } from "./image";

const promoter = deriveKey(new Uint8Array(32).fill(7), TESTNET3).address;
const draft: LaunchDraft = {
  symbol: "MESH",
  name: "Meshwork",
  blurb: "Community token for a mesh-relay operators' group.",
  accent: "var(--amber)",
  promoter,
  opensInBlocks: 6,
  links: NO_LINKS,
  story: NO_STORY,
  image: "",
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

describe("launch links and story", () => {
  const creator = "02" + "11".repeat(32);

  it("accept only https links on the host each kind promises", () => {
    expect(linkFor("website", "https://mesh.example/about")).toBe("https://mesh.example/about");
    expect(linkFor("website", "http://mesh.example")).toBeNull();
    expect(linkFor("website", "javascript:alert(1)")).toBeNull();
    expect(linkFor("website", "https://user:pw@mesh.example")).toBeNull();
    expect(linkFor("website", "mesh.example")).toBeNull();
    expect(linkFor("github", "https://github.com/meshwork")).toBe("https://github.com/meshwork");
    expect(linkFor("github", "https://gitlab.com/meshwork")).toBeNull();
    expect(linkFor("github", "https://github.com/")).toBeNull();
    expect(linkFor("telegram", "https://t.me/meshwork")).toBe("https://t.me/meshwork");
    expect(linkFor("discord", "https://discord.gg/abc123")).toBe("https://discord.gg/abc123");
    expect(linkFor("discord", "https://discord.evil.example/abc")).toBeNull();
    expect(linkFor("website", `https://mesh.example/${"a".repeat(MAX_LINK_LENGTH)}`)).toBeNull();
  });

  it("turn an X handle into its x.com address", () => {
    expect(linkFor("x", "@meshwork")).toBe("https://x.com/meshwork");
    expect(linkFor("x", "meshwork")).toBe("https://x.com/meshwork");
    expect(linkFor("x", "https://twitter.com/meshwork")).toBe("https://twitter.com/meshwork");
    expect(linkFor("x", "@not a handle")).toBeNull();
  });

  it("name each bad link and each long paragraph in place", () => {
    const faults = validate(
      {
        ...draft,
        links: { ...NO_LINKS, website: "ftp://mesh.example", github: "https://gitlab.com/x" },
        story: { why: "w".repeat(MAX_STORY_LENGTH + 1), plan: "fine" },
        image: "http://img.example/p.png",
      },
      TESTNET3,
    );
    expect(Object.keys(faults).sort()).toEqual(["image", "links.github", "links.website", "story.why"]);
  });

  it("are optional, and leave an announcement without them exactly as before", () => {
    const plain = commitmentFor(draft, creator, 150_000, TESTNET3);
    expect("links" in plain).toBe(false);
    expect("story" in plain).toBe(false);
    expect("image" in plain).toBe(false);
    const withExtras = commitmentFor(
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

  it("drop whatever does not pass when read back from anywhere", () => {
    const tampered = {
      links: { website: "javascript:alert(1)", github: "https://github.com/ok", extra: "https://x.example" },
      story: { why: 42, plan: "p".repeat(MAX_STORY_LENGTH + 1) },
    } as unknown as Parameters<typeof publicExtras>[0];
    expect(publicExtras(tampered)).toEqual({ links: { github: "https://github.com/ok" }, story: {} });
    expect(publicExtras({})).toEqual({ links: {}, story: {} });
  });

  it("keep the largest valid announcement inside the index's payload and request limits", () => {
    // Quotes are the worst case: each costs two characters in the payload
    // and four in the request. Fill every free-text field with them, then the
    // links and story with as much as the budget allows.
    const worst: LaunchDraft = {
      ...draft,
      symbol: "WWWWWWWW",
      name: '"'.repeat(40),
      blurb: '"'.repeat(160),
      links: {
        website: `https://mesh.example/${"w".repeat(MAX_LINK_LENGTH - 21)}`,
        x: "@" + "x".repeat(15),
        telegram: `https://t.me/${"t".repeat(80)}`,
        discord: `https://discord.gg/${"d".repeat(80)}`,
        github: `https://github.com/${"g".repeat(80)}`,
      },
      story: { why: "", plan: "" },
      image: `https://img.example/${"i".repeat(MAX_IMAGE_LENGTH - 20)}`,
    };
    // Grow the story until the budget refuses it; keep the last accepted size.
    let accepted = worst;
    for (let n = 10; n <= MAX_STORY_LENGTH; n += 10) {
      const next = { ...worst, story: { why: '"'.repeat(n), plan: "p".repeat(MAX_STORY_LENGTH) } };
      if (validate(next, TESTNET3).extras) break;
      accepted = next;
    }
    expect(validate(accepted, TESTNET3)).toEqual({});
    expect(accepted.story.why.length).toBeGreaterThan(0);
    expect(commitmentFor(accepted, creator, 150_000, TESTNET3).image).toBe(accepted.image);
    const meta = JSON.stringify(commitmentFor(accepted, creator, 150_000, TESTNET3));
    expect(meta.length).toBeLessThanOrEqual(MAX_META);
    const request = JSON.stringify({
      body: {
        v: ACTIVITY_VERSION,
        kind: "launch",
        launch: "wwwwwwww-0123456789abcdef",
        actor: creator,
        amount: "0",
        sats: 0,
        ref: "ab".repeat(32),
        meta,
        at: new Date().toISOString(),
      },
      signature: "cd".repeat(64),
    });
    expect(request.length).toBeLessThanOrEqual(4096);
    expect(EXTRAS_WIRE_BUDGET).toBeGreaterThan(0);
  });
});
