/* The signed announcement of a launch, and the identity it must carry.
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
 * different token. Only `imageHash` of the picture is in the terms; links,
 * story and the image reference are signed extras (`./extras.ts`).
 */

import { canonicalId, type Field } from "../canonical";
import { ACTIVE, type NetworkConfig } from "../bitcoin/network";
import { ACTIVE_RGBPP } from "../rgbpp/config";
import { encodeTerms, metadataHash, promoterScriptFor, tokenId, type LaunchTerms, type TokenMetadata } from "../rgbpp/launch";
import { admitted } from "./certificate";
import { LINK_KINDS, STORY_PARTS, type LaunchLinks, type LaunchStory } from "./extras";

/** Hex characters of the token id carried in a launch id: 64 bits. */
const ID_TOKEN_CHARS = 16;

/** The signed announcement of a launch. */
export interface LaunchCommitment {
  v: "btcfun/launch/3";
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
  /** The registration's txid (displayed order): the Bitcoin payment that registered the launch. */
  registration: string;
  /** btc.fun's certificate over the terms and the registration, 64 bytes hex. */
  certificate: string;
  /** The xUDT type hash the terms produce. */
  tokenId: string;
  /** Identity of the announcer. */
  creator: string;
  at: string;
  /** Signed by the creator, not enforced on chain. Absent when none were given. */
  links?: LaunchLinks;
  /** Signed by the creator, not enforced on chain. Absent when none was given. */
  story?: LaunchStory;
  /**
   * Where the token's picture lives (`imageFor` in `./image.ts`). Signed by
   * the creator, outside the metadata hash; `imageHash` is what the terms
   * commit to. Absent when none was given.
   */
  image?: string;
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
 * produce and btc.fun certified those terms — an uncertified launch could
 * never take a ticket. False for anything malformed, rather than throwing:
 * announcements arrive from an index, which is untrusted input.
 */
export function idMatches(c: LaunchCommitment, network: NetworkConfig = ACTIVE): boolean {
  try {
    const terms = termsOf(c, network);
    const token = tokenId(ACTIVE_RGBPP, terms);
    return c.tokenId === token && c.id === launchIdFor(c.symbol, token) && admitted(encodeTerms(terms), c.registration, c.certificate);
  } catch {
    return false;
  }
}

function fieldsOf(c: LaunchCommitment): Field[] {
  // Links, story and image are appended only when present, so every announcement
  // made before they existed keeps the digest it was published under. Each
  // is tagged by its own label, so no field set can encode like another.
  const extras: Field[] = [
    ...LINK_KINDS.flatMap((kind): Field[] => (c.links?.[kind] ? [[`link.${kind}`, c.links[kind]]] : [])),
    ...STORY_PARTS.flatMap((part): Field[] => (c.story?.[part] ? [[`story.${part}`, c.story[part]]] : [])),
    ...(c.image ? [["image", c.image] as Field] : []),
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
    ["registration", c.registration],
    ["certificate", c.certificate],
    ["tokenId", c.tokenId],
    ["creator", c.creator],
    ["at", c.at],
    ...extras,
  ];
}

/** The digest the creator signs: every field, canonically encoded (`../canonical.ts`). */
export function commitmentId(c: LaunchCommitment): string {
  return canonicalId(fieldsOf(c));
}
