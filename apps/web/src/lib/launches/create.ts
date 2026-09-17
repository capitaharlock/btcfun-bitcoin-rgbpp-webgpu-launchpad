/* Creating a launch.
 *
 * A launch is the token's identity and nothing else: a symbol, a name, one
 * sentence, an accent colour, the Bitcoin address its tickets pay, and the
 * height it opens at. The economics are the standard (`PROTOCOL.md` §4) and are
 * not the creator's to choose.
 *
 * The launch id is the token's own identity. Its terms — opening height,
 * metadata hash and promoter script — are the mint script's args, and the
 * token is the xUDT that script owns, so `tokenId` is fixed by the terms and
 * the id carries its first 64 bits. Two creators cannot share an id without
 * sharing every term, and nobody can announce a launch whose id belongs to a
 * different token.
 *
 * A launch may also carry project links and a short story — why it raises
 * funds and what its community will do with them. Both are part of the
 * creator-signed announcement and nothing else: they are not in the token's
 * metadata hash, so they never change the token id, and nothing on chain
 * enforces them. They say what the creator claims, under the creator's key.
 *
 * Creating a launch costs nothing on chain: the mint script is already
 * deployed and permissionless, and the token comes into existence with its
 * first mint. What is published is a signed announcement to the index, so
 * others can find it, and a local copy so the creator sees it immediately.
 */

import { canonicalId, type Field } from "../canonical";
import { record, signActivity } from "../activity";
import type { Vault } from "../bitcoin";
import { ACTIVE, matchesNetwork, type NetworkConfig } from "../bitcoin/network";
import { ACTIVE_RGBPP } from "../rgbpp/config";
import { metadataHash, promoterScriptFor, tokenId, type LaunchTerms, type TokenMetadata } from "../rgbpp/launch";
import { Address } from "@scure/btc-signer";

const LOCAL_KEY = "btcfun:created-launches:v2";

/** Hex characters of the token id carried in a launch id: 64 bits. */
const ID_TOKEN_CHARS = 16;

export const ACCENTS = [
  "var(--amber)",
  "var(--cyan)",
  "var(--magenta)",
  "var(--violet)",
  "var(--mint)",
  "var(--warn)",
] as const;

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
 * limit is 4,096 characters (`worker/index.ts`); the fixed part of a launch
 * event takes about 2,000 of those at worst. Sized so that five full links
 * and two full paragraphs of ordinary prose fit; `create.test.ts` checks the
 * worst case against both limits.
 */
export const EXTRAS_WIRE_BUDGET = 2_000;

/** The signed announcement of a launch. */
export interface LaunchCommitment {
  v: "btcfun/launch/2";
  id: string;
  symbol: string;
  name: string;
  blurb: string;
  accent: string;
  /** SHA-256 of the token image, hex; empty when there is none. */
  imageHash: string;
  /** Bitcoin height at which minting opens. */
  h0: number;
  /** The Bitcoin address every ticket pays. */
  promoter: string;
  /** The xUDT type hash the terms produce. */
  tokenId: string;
  /** Identity of the announcer. */
  creator: string;
  at: string;
  /** Signed by the creator, not enforced on chain. Absent when none were given. */
  links?: LaunchLinks;
  /** Signed by the creator, not enforced on chain. Absent when none was given. */
  story?: LaunchStory;
}

export function metadataOf(c: Pick<LaunchCommitment, "name" | "symbol" | "blurb" | "imageHash">): TokenMetadata {
  return { name: c.name, symbol: c.symbol, description: c.blurb, imageHash: c.imageHash };
}

export function termsOf(
  c: Pick<LaunchCommitment, "name" | "symbol" | "blurb" | "imageHash" | "h0" | "promoter">,
  network: NetworkConfig = ACTIVE,
): LaunchTerms {
  return {
    h0: c.h0,
    metadataHash: metadataHash(metadataOf(c)),
    promoterScript: promoterScriptFor(c.promoter, network),
  };
}

/** The readable half of a launch id. Not unique on its own. */
export function slugFor(symbol: string): string {
  return symbol.trim().toLowerCase();
}

export function launchIdFor(symbol: string, token: string): string {
  return `${slugFor(symbol)}-${token.replace(/^0x/, "").slice(0, ID_TOKEN_CHARS)}`;
}

export const LAUNCH_ID_PATTERN = new RegExp(`^[a-z][a-z0-9]{1,7}-[0-9a-f]{${ID_TOKEN_CHARS}}$`);

/**
 * True when an announcement's id and token id are the ones its own terms
 * produce. False for anything malformed, rather than throwing: announcements
 * arrive from an index, which is untrusted input.
 */
export function idMatches(c: LaunchCommitment, network: NetworkConfig = ACTIVE): boolean {
  try {
    const token = tokenId(ACTIVE_RGBPP, termsOf(c, network));
    return c.tokenId === token && c.id === launchIdFor(c.symbol, token);
  } catch {
    return false;
  }
}

function fieldsOf(c: LaunchCommitment): Field[] {
  // Links and story are appended only when present, so every announcement
  // made before they existed keeps the digest it was published under. Each
  // is tagged by its own label, so no field set can encode like another.
  const extras: Field[] = [
    ...LINK_KINDS.flatMap((kind): Field[] => (c.links?.[kind] ? [[`link.${kind}`, c.links[kind]]] : [])),
    ...STORY_PARTS.flatMap((part): Field[] => (c.story?.[part] ? [[`story.${part}`, c.story[part]]] : [])),
  ];
  return [
    ["v", c.v],
    ["id", c.id],
    ["symbol", c.symbol],
    ["name", c.name],
    ["blurb", c.blurb],
    ["accent", c.accent],
    ["imageHash", c.imageHash],
    ["h0", String(c.h0)],
    ["promoter", c.promoter],
    ["tokenId", c.tokenId],
    ["creator", c.creator],
    ["at", c.at],
    ...extras,
  ];
}

export function commitmentId(c: LaunchCommitment): string {
  return canonicalId(fieldsOf(c));
}

export interface LaunchDraft {
  symbol: string;
  name: string;
  blurb: string;
  accent: string;
  /** Where ticket income goes. Defaults to the creator's own address. */
  promoter: string;
  /** Blocks from now until minting opens. At least one: a launch is announced before it opens. */
  opensInBlocks: number;
  /** As typed; empty strings are "not given". Normalised by `linkFor`. */
  links: Record<LinkKind, string>;
  /** As typed; empty strings are "not given". */
  story: Record<StoryPart, string>;
}

export const NO_LINKS: Record<LinkKind, string> = { website: "", x: "", telegram: "", discord: "", github: "" };
export const NO_STORY: Record<StoryPart, string> = { why: "", plan: "" };

/** A draft field a fault can be attached to. */
export type DraftField =
  | Exclude<keyof LaunchDraft, "links" | "story">
  | `links.${LinkKind}`
  | `story.${StoryPart}`
  | "extras";

/** Field-level problems, keyed by field, so a form can show them in place. */
export type DraftFaults = Partial<Record<DraftField, string>>;

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
 * Used on what a creator types and again on what arrives from the index,
 * which is untrusted: a signed `javascript:` link is still a `javascript:` link.
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

/** The links and story of a draft, normalised, with empty parts left out. */
export function extrasOf(draft: Pick<LaunchDraft, "links" | "story">): { links?: LaunchLinks; story?: LaunchStory } {
  const links: LaunchLinks = {};
  for (const kind of LINK_KINDS) {
    const href = linkFor(kind, draft.links[kind]);
    if (href) links[kind] = href;
  }
  const story: LaunchStory = {};
  for (const part of STORY_PARTS) {
    const text = storyFor(draft.story[part]);
    if (text) story[part] = text;
  }
  return {
    ...(Object.keys(links).length > 0 ? { links } : {}),
    ...(Object.keys(story).length > 0 ? { story } : {}),
  };
}

/**
 * The links and story an announcement from anywhere may be shown with: each
 * one re-checked, anything unacceptable dropped rather than the whole launch.
 */
export function publicExtras(c: Pick<LaunchCommitment, "links" | "story">): { links: LaunchLinks; story: LaunchStory } {
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

export function validate(draft: LaunchDraft, network: NetworkConfig = ACTIVE): DraftFaults {
  const faults: DraftFaults = {};

  const symbol = draft.symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(symbol)) {
    faults.symbol = "2–8 characters, letters and digits, starting with a letter.";
  }
  if (draft.name.trim().length < 2 || draft.name.trim().length > 40) {
    faults.name = "Between 2 and 40 characters.";
  }
  if (draft.blurb.trim().length < 10 || draft.blurb.trim().length > 160) {
    faults.blurb = "Between 10 and 160 characters — one sentence people will read.";
  }
  if (!validAddress(draft.promoter.trim(), network)) {
    faults.promoter = `A ${network.label} address, starting with ${network.addressPrefix}.`;
  }
  // Opening at a future block is what stops a creator mining their own launch
  // before anyone else can see it.
  if (!Number.isInteger(draft.opensInBlocks) || draft.opensInBlocks < 1 || draft.opensInBlocks > 1008) {
    faults.opensInBlocks = "Between 1 and 1,008 blocks from now.";
  }
  for (const kind of LINK_KINDS) {
    const typed = draft.links[kind].trim();
    if (typed && !linkFor(kind, typed)) {
      faults[`links.${kind}`] = typed.length > MAX_LINK_LENGTH ? `At most ${MAX_LINK_LENGTH} characters.` : LINK_RULE[kind];
    }
  }
  for (const part of STORY_PARTS) {
    if (draft.story[part].trim().length > MAX_STORY_LENGTH) {
      faults[`story.${part}`] = `At most ${MAX_STORY_LENGTH} characters.`;
    }
  }
  // The wire size, as the index will measure it: JSON inside JSON.
  if (JSON.stringify(JSON.stringify(extrasOf(draft))).length > EXTRAS_WIRE_BUDGET) {
    faults.extras = "The links and story are too long together once encoded. Shorten the story.";
  }
  return faults;
}

function validAddress(address: string, network: NetworkConfig): boolean {
  if (!matchesNetwork(address, network)) return false;
  try {
    Address(network.params).decode(address);
    return true;
  } catch {
    return false;
  }
}

export function isReady(draft: LaunchDraft, network: NetworkConfig = ACTIVE): boolean {
  return Object.keys(validate(draft, network)).length === 0;
}

/** The announcement a draft implies, given the height it is signed at. */
export function commitmentFor(
  draft: LaunchDraft,
  creator: string,
  tipHeight: number,
  network: NetworkConfig = ACTIVE,
): LaunchCommitment {
  const base = {
    symbol: draft.symbol.trim().toUpperCase(),
    name: draft.name.trim(),
    blurb: draft.blurb.trim(),
    imageHash: "",
    h0: tipHeight + draft.opensInBlocks,
    promoter: draft.promoter.trim(),
  };
  const token = tokenId(ACTIVE_RGBPP, termsOf(base, network));
  return {
    v: "btcfun/launch/2",
    id: launchIdFor(base.symbol, token),
    ...base,
    accent: draft.accent,
    tokenId: token,
    creator,
    at: new Date().toISOString(),
    ...extrasOf(draft),
  };
}

/** Sign the announcement, keep it locally and publish it to the index. */
export async function createLaunch(vault: Vault, draft: LaunchDraft, tipHeight: number): Promise<LaunchCommitment> {
  const faults = validate(draft);
  if (Object.keys(faults).length > 0) {
    throw new Error(Object.values(faults)[0] ?? "That launch is not valid.");
  }
  const commitment = commitmentFor(draft, vault.identity, tipHeight);
  const signed = await signActivity(vault, {
    kind: "launch",
    launch: commitment.id,
    ref: commitmentId(commitment),
    meta: JSON.stringify(commitment),
  });
  remember(commitment);
  await record(signed);
  return commitment;
}

// ── local mirror ─────────────────────────────────────────────────────────────

function readLocal(): LaunchCommitment[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as LaunchCommitment[]) : [];
  } catch {
    return [];
  }
}

function remember(commitment: LaunchCommitment): void {
  try {
    const existing = readLocal().filter((c) => c.id !== commitment.id);
    localStorage.setItem(LOCAL_KEY, JSON.stringify([commitment, ...existing].slice(0, 50)));
  } catch {
    // Storage full or blocked: the index copy still exists, and the page shows it.
  }
}

export function createdLocally(): LaunchCommitment[] {
  return readLocal();
}
