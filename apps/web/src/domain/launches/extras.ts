/* A launch's project links and story — what the creator claims, under their key.
 *
 * Both are part of the creator-signed announcement and nothing else: they are
 * not in the token's metadata hash, so they never change the token id, and
 * nothing on chain enforces them. An image reference travels the same way
 * (`./image.ts`): signed, re-checked on arrival, and outside the token id.
 *
 * Everything here runs twice: on what a creator types, and again on what
 * arrives from the index, which is untrusted — a signed `javascript:` link is
 * still a `javascript:` link.
 */

import { imageFor } from "./image";

/** Where a project lives online. Every value is an https URL. */
export interface LaunchLinks {
  website?: string;
  x?: string;
  telegram?: string;
  discord?: string;
  github?: string;
}

export type LinkKind = keyof LaunchLinks;

export const LINK_KINDS: readonly LinkKind[] = ["website", "x", "telegram", "discord", "github"];

/** Why the launch raises funds, and what its community will do with them. */
export interface LaunchStory {
  why?: string;
  plan?: string;
}

export type StoryPart = keyof LaunchStory;

export const STORY_PARTS: readonly StoryPart[] = ["why", "plan"];

export const MAX_LINK_LENGTH = 120;
export const MAX_STORY_LENGTH = 400;

/**
 * Most characters the links and story may take once the announcement is
 * encoded into an index event. The event travels as JSON inside JSON, so a
 * quote costs four characters by the time it reaches the index, whose body
 * limit is 4,096 characters (`worker/http.ts`); the fixed part of a launch
 * event takes about 2,000 of those at worst, and an image reference up to 150
 * more. Sized so that five full links and two full paragraphs of ordinary
 * prose fit; `draft.test.ts` checks the worst case against both limits.
 */
export const EXTRAS_WIRE_BUDGET = 2_000;

/** Hosts each kind of link may point at, so an icon never lies about where it goes. */
const LINK_HOSTS: Record<Exclude<LinkKind, "website">, readonly string[]> = {
  x: ["x.com", "twitter.com"],
  telegram: ["t.me", "telegram.me"],
  discord: ["discord.gg", "discord.com"],
  github: ["github.com"],
};

/** What each kind of link must look like, in words a person can act on. */
export const LINK_RULE: Record<LinkKind, string> = {
  website: "An https:// address.",
  x: "An x.com address or an @handle.",
  telegram: "A t.me address.",
  discord: "A discord.gg or discord.com address.",
  github: "A github.com address.",
};

function httpsUrl(text: string): URL | null {
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * The canonical form of a link, or null when it is not an acceptable one.
 *
 * Only https, only the hosts a kind promises, and never longer than
 * `MAX_LINK_LENGTH`. An X handle (`@name` or `name`) becomes its x.com URL.
 */
export function linkFor(kind: LinkKind, input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (text === "" || text.length > MAX_LINK_LENGTH) return null;
  if (kind === "x") {
    const handle = /^@?([A-Za-z0-9_]{1,15})$/.exec(text);
    if (handle) return `https://x.com/${handle[1]}`;
  }
  const url = httpsUrl(text);
  if (!url) return null;
  if (kind !== "website") {
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!LINK_HOSTS[kind].includes(host)) return null;
    if (url.pathname.length <= 1) return null;
  }
  const href = url.href;
  return href.length <= MAX_LINK_LENGTH ? href : null;
}

/** A story paragraph as it will be published, or null when there is none or it is too long. */
export function storyFor(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim();
  return text !== "" && text.length <= MAX_STORY_LENGTH ? text : null;
}

/** Links and story as a form holds them: every part present, empty for "not given". */
export interface TypedExtras {
  links: Record<LinkKind, string>;
  story: Record<StoryPart, string>;
  image?: string;
}

/** The links, story and image typed into a form, normalised, with empty parts left out. */
export function extrasOf(typed: TypedExtras): { links?: LaunchLinks; story?: LaunchStory; image?: string } {
  const links: LaunchLinks = {};
  for (const kind of LINK_KINDS) {
    const href = linkFor(kind, typed.links[kind]);
    if (href) links[kind] = href;
  }
  const story: LaunchStory = {};
  for (const part of STORY_PARTS) {
    const text = storyFor(typed.story[part]);
    if (text) story[part] = text;
  }
  const image = imageFor(typed.image);
  return {
    ...(Object.keys(links).length > 0 ? { links } : {}),
    ...(Object.keys(story).length > 0 ? { story } : {}),
    ...(image ? { image } : {}),
  };
}

/**
 * The links and story an announcement from anywhere may be shown with: each
 * one re-checked, anything unacceptable dropped rather than the whole launch.
 */
export function publicExtras(c: { links?: LaunchLinks; story?: LaunchStory }): { links: LaunchLinks; story: LaunchStory } {
  const links: LaunchLinks = {};
  const story: LaunchStory = {};
  const rawLinks: unknown = c.links;
  const rawStory: unknown = c.story;
  if (typeof rawLinks === "object" && rawLinks !== null) {
    for (const kind of LINK_KINDS) {
      const href = linkFor(kind, (rawLinks as Record<string, unknown>)[kind]);
      if (href) links[kind] = href;
    }
  }
  if (typeof rawStory === "object" && rawStory !== null) {
    for (const part of STORY_PARTS) {
      const text = storyFor((rawStory as Record<string, unknown>)[part]);
      if (text) story[part] = text;
    }
  }
  return { links, story };
}
