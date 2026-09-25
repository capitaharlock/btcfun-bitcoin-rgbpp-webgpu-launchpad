import { describe, expect, it } from "vitest";

import { meshDraft as draft, TEST_CREATOR as creator, certifiedFor } from "../../test/launches";
import { TESTNET3 } from "../bitcoin/network";
import { ACTIVITY_VERSION } from "../activity";
import { MAX_META } from "../activity/verify";
import { NO_LINKS, validate, type LaunchDraft } from "./draft";
import { EXTRAS_WIRE_BUDGET, MAX_LINK_LENGTH, MAX_STORY_LENGTH } from "./extras";
import { MAX_IMAGE_LENGTH } from "./image";

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

describe("launch links and story in a draft", () => {
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
    expect(certifiedFor(accepted, creator, 150_000, TESTNET3).image).toBe(accepted.image);
    const meta = JSON.stringify(certifiedFor(accepted, creator, 150_000, TESTNET3));
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
