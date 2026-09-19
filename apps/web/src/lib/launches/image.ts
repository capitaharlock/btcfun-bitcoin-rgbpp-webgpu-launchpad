/* A token's picture.
 *
 * Where the picture comes from, in order:
 *   1. the creator's signed announcement (`LaunchCommitment.image`), re-checked
 *      on arrival like the links;
 *   2. the platform's own artwork for launches it published before
 *      announcements could carry an image, keyed by launch id and labelled as
 *      supplied by the platform;
 *   3. nothing — and the interface draws the launch's pixel sigil instead.
 *
 * The image is not part of the token's identity: the metadata hash commits to
 * `imageHash`, not to a location. When a launch's terms carry an image hash,
 * the bytes can be checked against it (`imageMatches`); a match earns a
 * "verified" mark, a mismatch a warning, and neither ever hides the picture.
 */

import { sha256 } from "@noble/hashes/sha2";

import { bytesToHex } from "../bytes";

/** Longest image reference an announcement may carry, like a link. */
export const MAX_IMAGE_LENGTH = 120;

/** Artwork served by this site, e.g. `/tokens/pizza.svg`. */
const SITE_IMAGE = /^\/tokens\/[a-z0-9][a-z0-9-]{0,31}\.(svg|png|webp)$/;

/**
 * The canonical image reference, or null when it is not an acceptable one:
 * this site's own token artwork, or an https URL with no credentials in it.
 * Announcements arrive from an index, which is untrusted input.
 */
export function imageFor(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (text === "" || text.length > MAX_IMAGE_LENGTH) return null;
  if (SITE_IMAGE.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
    return url.href.length <= MAX_IMAGE_LENGTH ? url.href : null;
  } catch {
    return null;
  }
}

/** True when `bytes` are the image a launch's terms commit to. False when the terms carry no hash. */
export function imageMatches(bytes: Uint8Array, imageHash: string): boolean {
  return /^[0-9a-f]{64}$/.test(imageHash) && bytesToHex(sha256(bytes)) === imageHash;
}

/** Who supplied the picture shown for a launch. */
export type ArtSource = "creator" | "platform";

export interface TokenArt {
  src: string;
  by: ArtSource;
}

/**
 * Artwork for launches the platform published before announcements carried
 * an image. The seed script re-announces them with `image` set, after which
 * the creator's signed copy takes over and these entries are only a fallback.
 */
export const PLATFORM_IMAGES: Readonly<Record<string, string>> = {
  "liveqa-351ffc765c73815f": "/tokens/liveqa.svg",
  "pizza-df3a41ba085f0f0b": "/tokens/pizza.svg",
  "genesis-4640bfdafc71a835": "/tokens/genesis.svg",
  "hodl-03967617dee85244": "/tokens/hodl.svg",
  "laser-8af6006b1a4d05ba": "/tokens/laser.svg",
  "stack-4b8b72193865e2ef": "/tokens/stack.svg",
  "orange-297ba5566bd96b0e": "/tokens/orange.svg",
  "node-df0150924e71b686": "/tokens/node.svg",
  "halving-cbd87da471c6396d": "/tokens/halving.svg",
  "cypher-b5121685bf8a6de5": "/tokens/cypher.svg",
  "timechn-4e82b62fa3250482": "/tokens/timechn.svg",
};

/** The picture to show for an announcement, and who supplied it; null draws the sigil. */
export function artFor(c: { id: string; image?: unknown }): TokenArt | null {
  const signed = imageFor(c.image);
  if (signed) return { src: signed, by: "creator" };
  const platform = PLATFORM_IMAGES[c.id];
  return platform ? { src: platform, by: "platform" } : null;
}
