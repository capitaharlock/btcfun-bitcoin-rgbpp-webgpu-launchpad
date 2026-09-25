import { describe, expect, it } from "vitest";

import { linkFor, MAX_LINK_LENGTH, MAX_STORY_LENGTH, publicExtras } from "./extras";

describe("launch links and story", () => {
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

  it("drop whatever does not pass when read back from anywhere", () => {
    const tampered = {
      links: { website: "javascript:alert(1)", github: "https://github.com/ok", extra: "https://x.example" },
      story: { why: 42, plan: "p".repeat(MAX_STORY_LENGTH + 1) },
    } as unknown as Parameters<typeof publicExtras>[0];
    expect(publicExtras(tampered)).toEqual({ links: { github: "https://github.com/ok" }, story: {} });
    expect(publicExtras({})).toEqual({ links: {}, story: {} });
  });
});
