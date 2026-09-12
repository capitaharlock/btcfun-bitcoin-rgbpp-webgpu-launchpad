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
}

/** Field-level problems, keyed by field, so a form can show them in place. */
export type DraftFaults = Partial<Record<keyof LaunchDraft, string>>;

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
