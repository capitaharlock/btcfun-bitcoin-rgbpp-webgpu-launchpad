/* A launch as a creator types it, checked field by field.
 *
 * The draft is what the create form holds; `validate` names each fault next to
 * the field it belongs to, and `commitmentFor` turns a valid draft — once its
 * registration is paid and certified (`./registration.ts`) — into the
 * announcement it implies.
 */

import { Address } from "@scure/btc-signer";

import { ACTIVE, matchesNetwork, type NetworkConfig } from "@/domain/bitcoin";
import { ACTIVE_RGBPP } from "@/domain/rgbpp";
import { encodeTerms, tokenId } from "@/domain/rgbpp";
import { launchIdFor, termsOf, type LaunchCommitment } from "./announcement";
import { EXTRAS_WIRE_BUDGET, extrasOf, LINK_KINDS, LINK_RULE, linkFor, MAX_LINK_LENGTH, MAX_STORY_LENGTH, STORY_PARTS, type LinkKind, type StoryPart } from "./extras";
import { imageFor } from "./image";
import type { Registration } from "@/app/launches/registration";

export const ACCENTS = [
  "var(--amber)",
  "var(--cyan)",
  "var(--magenta)",
  "var(--violet)",
  "var(--mint)",
  "var(--warn)",
] as const;

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
  /** Where the token's picture lives, as typed; empty is "none". Checked by `imageFor`. */
  image: string;
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
  if (draft.image.trim() && !imageFor(draft.image)) {
    faults.image = "An https:// address, or a picture on this site under /tokens/.";
  }
  for (const part of STORY_PARTS) {
    if (draft.story[part].trim().length > MAX_STORY_LENGTH) {
      faults[`story.${part}`] = `At most ${MAX_STORY_LENGTH} characters.`;
    }
  }
  // The wire size, as the index will measure it: JSON inside JSON.
  if (JSON.stringify(JSON.stringify(extrasOf(draft))).length > EXTRAS_WIRE_BUDGET) {
    faults.extras = "The links, story and image are too long together once encoded. Shorten the story.";
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

/** A draft's announcement fields and terms, at the height it opens at. */
export function draftTerms(draft: LaunchDraft, h0: number, network: NetworkConfig = ACTIVE) {
  const base = {
    symbol: draft.symbol.trim().toUpperCase(),
    name: draft.name.trim(),
    blurb: draft.blurb.trim(),
    imageHash: "",
    h0,
    promoter: draft.promoter.trim(),
  };
  return { base, args: encodeTerms(termsOf(base, network)) };
}

/** The announcement a draft implies, once its terms are registered and certified. */
export function commitmentFor(
  draft: LaunchDraft,
  creator: string,
  registration: Registration,
  certificate: string,
  network: NetworkConfig = ACTIVE,
): LaunchCommitment {
  const { base } = draftTerms(draft, registration.h0, network);
  const token = tokenId(ACTIVE_RGBPP, termsOf(base, network));
  return {
    v: "btcfun/launch/3",
    id: launchIdFor(base.symbol, token),
    ...base,
    accent: draft.accent,
    registration: registration.txid,
    certificate,
    tokenId: token,
    creator,
    at: new Date().toISOString(),
    ...extrasOf(draft),
  };
}
