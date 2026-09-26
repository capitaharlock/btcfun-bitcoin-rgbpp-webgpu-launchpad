import { certifiedFor } from "@/test/launches";
import { sha256 } from "@noble/hashes/sha2";
import { describe, expect, it } from "vitest";

import { bytesToHex } from "@/domain/codec";
import { deriveKey } from "@/domain/bitcoin";
import { TESTNET3 } from "@/domain/bitcoin";
import { commitmentId, idMatches } from "./announcement";
import { NO_LINKS, NO_STORY } from "./draft";
import { artFor, imageFor, imageMatches, MAX_IMAGE_LENGTH, PLATFORM_IMAGES } from "./image";

describe("image references", () => {
  it("accept this site's token artwork and https URLs", () => {
    expect(imageFor("/tokens/pizza.svg")).toBe("/tokens/pizza.svg");
    expect(imageFor(" https://img.example/p.png ")).toBe("https://img.example/p.png");
  });

  it("refuse anything else, including what an index might inject", () => {
    for (const bad of [
      "javascript:alert(1)",
      "http://img.example/p.png",
      "https://user:pw@img.example/p.png",
      "/tokens/../secret.svg",
      "/tokens/p.gif",
      "data:image/svg+xml,<svg/>",
      `https://img.example/${"p".repeat(MAX_IMAGE_LENGTH)}`,
      "",
      42,
      null,
    ]) {
      expect(imageFor(bad), String(bad)).toBeNull();
    }
  });
});

describe("image hash", () => {
  const bytes = new TextEncoder().encode("<svg>a token</svg>");
  const hash = bytesToHex(sha256(bytes));

  it("matches the bytes the terms commit to", () => {
    expect(imageMatches(bytes, hash)).toBe(true);
  });

  it("does not match other bytes, or terms with no hash", () => {
    expect(imageMatches(new TextEncoder().encode("<svg>another</svg>"), hash)).toBe(false);
    expect(imageMatches(bytes, "")).toBe(false);
    expect(imageMatches(bytes, hash.toUpperCase())).toBe(false);
  });
});

describe("which picture a launch shows", () => {
  it("prefers the creator's signed image, then the platform's, then none", () => {
    const [id, platform] = Object.entries(PLATFORM_IMAGES)[0]!;
    expect(artFor({ id, image: "/tokens/other.svg" })).toEqual({ src: "/tokens/other.svg", by: "creator" });
    expect(artFor({ id })).toEqual({ src: platform, by: "platform" });
    expect(artFor({ id, image: "javascript:alert(1)" })).toEqual({ src: platform, by: "platform" });
    expect(artFor({ id: "mesh-0000000000000000" })).toBeNull();
  });

  it("is signed with the announcement but leaves the token id alone", () => {
    const promoter = deriveKey(new Uint8Array(32).fill(7), TESTNET3).address;
    const plain = certifiedFor(
      { symbol: "MESH", name: "Meshwork", blurb: "Community token for a mesh-relay group.", accent: "var(--cyan)", promoter, opensInBlocks: 6, links: NO_LINKS, story: NO_STORY, image: "" },
      "02".padEnd(66, "a"),
      150_000,
      TESTNET3,
    );
    const pictured = { ...plain, image: "/tokens/mesh.svg" };
    expect(commitmentId(pictured)).not.toBe(commitmentId(plain));
    expect(commitmentId({ ...plain, image: undefined })).toBe(commitmentId(plain));
    expect(idMatches(pictured, TESTNET3)).toBe(true);
  });
});
