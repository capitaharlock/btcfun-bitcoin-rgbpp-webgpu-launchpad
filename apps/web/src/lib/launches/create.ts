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
 * An image reference travels the same way (`./image.ts`): signed, re-checked
 * on arrival, and outside the token id. Only `imageHash` is in the terms.
 *
 * Creating a launch is paid, once: a Bitcoin transaction pays the platform
 * `REGISTRATION_SATS` and commits to the launch's terms, btc.fun's signer
 * checks it and certifies the terms (`./certificate.ts`), and the mint script
 * lets a miner into a launch only with that certificate. The announcement
 * carries the registration and the certificate, so every page — and every
 * miner's first arming — can check them. Then a signed announcement goes to the index, so others can find it, and a
 * local copy is kept so the creator sees it immediately.
 *
 * A registration is paid before it is certified, so it is kept on the device
 * the moment it is broadcast (`pendingRegistration`): a reload, a failed
 * certificate request or a second attempt picks it up instead of paying again.
 */

import { canonicalId, type Field } from "../canonical";
import { imageFor } from "./image";
import { record, signActivity } from "../activity";
import type { Vault } from "../bitcoin";
import { ACTIVE, matchesNetwork, type NetworkConfig } from "../bitcoin/network";
import { ACTIVE_RGBPP } from "../rgbpp/config";
import { encodeTerms, metadataHash, promoterScriptFor, tokenId, type LaunchTerms, type TokenMetadata } from "../rgbpp/launch";
import { buildPayment } from "../bitcoin/payment";
import type { Utxo } from "../bitcoin/provider";
import { bytesToHex } from "@noble/hashes/utils";
import { admitted, REGISTRATION_SATS, registrationCommitment } from "./certificate";
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
 * event takes about 2,000 of those at worst, and an image reference up to 150
 * more. Sized so that five full links and two full paragraphs of ordinary
 * prose fit; `create.test.ts` checks the worst case against both limits.
 */
export const EXTRAS_WIRE_BUDGET = 2_000;

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

/** The links, story and image of a draft, normalised, with empty parts left out. */
export function extrasOf(
  draft: Pick<LaunchDraft, "links" | "story"> & { image?: string },
): { links?: LaunchLinks; story?: LaunchStory; image?: string } {
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
  const image = imageFor(draft.image);
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

// ── registration ─────────────────────────────────────────────────────────────

/** A registration paid for a draft: its txid and the height the launch opens at, which it committed to. */
export interface Registration {
  txid: string;
  h0: number;
  /** The commitment it carries, hex: which terms it paid for. */
  commitment: string;
}

const REGISTRATION_KEY = "btcfun:registrations:v1";

function readRegistrations(): Registration[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(REGISTRATION_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as Registration[]) : [];
  } catch {
    return [];
  }
}

/**
 * The registration already paid for this draft, if any: same identity and
 * promoter, whatever height it opens at. Paying twice for one launch is the
 * mistake this exists to prevent.
 */
export function pendingRegistration(draft: LaunchDraft, network: NetworkConfig = ACTIVE): Registration | null {
  for (const r of readRegistrations()) {
    if (bytesToHex(registrationCommitment(draftTerms(draft, r.h0, network).args)) === r.commitment) return r;
  }
  return null;
}

function keepRegistration(r: Registration): void {
  try {
    localStorage.setItem(REGISTRATION_KEY, JSON.stringify([r, ...readRegistrations()].slice(0, 20)));
  } catch {
    // Storage blocked: the txid is still shown on screen and in the wallet's activity.
  }
}

/** The payment a registration makes: the fee to the platform, committing to the launch. */
export function registrationPayment(draft: LaunchDraft, h0: number, network: NetworkConfig = ACTIVE) {
  return { to: ACTIVE_RGBPP.platformAddress, amountSats: REGISTRATION_SATS, memo: registrationCommitment(draftTerms(draft, h0, network).args) };
}

/**
 * Pay the registration: sign it with the wallet, broadcast it, and keep it
 * before anything else can fail. `utxos` must be plain coins — never a sealed
 * output.
 */
export async function payRegistration(
  vault: Vault,
  draft: LaunchDraft,
  h0: number,
  utxos: readonly Utxo[],
  feeRate: number,
  broadcast: (hex: string) => Promise<string>,
): Promise<Registration> {
  const payment = registrationPayment(draft, h0);
  const signed = await vault.use((key) => buildPayment(key, { ...payment, feeRate, utxos }));
  const txid = await broadcast(signed.hex);
  const registration = { txid, h0, commitment: bytesToHex(payment.memo) };
  keepRegistration(registration);
  return registration;
}

/**
 * The signer has not seen the registration yet. Not a failure: Bitcoin's
 * explorers learn of a transaction seconds after it is sent, so the request is
 * simply repeated.
 */
export class RegistrationNotSeen extends Error {}

/** Ask btc.fun's signer (`origin`, this site by default) for the certificate of a paid registration. */
export async function requestCertificate(draft: LaunchDraft, registration: Registration, origin = ""): Promise<string> {
  const { args } = draftTerms(draft, registration.h0);
  const res = await fetch(`${origin}/api/certify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ args: bytesToHex(args), registration: registration.txid }),
  });
  const body = (await res.json().catch(() => ({}))) as { certificate?: string; error?: string };
  if (res.status === 404) throw new RegistrationNotSeen(body.error ?? "The registration is not known to Bitcoin yet.");
  if (!res.ok || !body.certificate) throw new Error(body.error ?? `The certificate request failed (${res.status}).`);
  return body.certificate;
}

/** How long `certify` keeps asking while Bitcoin has not seen the payment: 5 s apart, 5 minutes in all. */
export const CERTIFY_RETRY = { everyMs: 5_000, tries: 60 };

/** The certificate of a paid registration, asked for again while the signer has not seen the payment. */
export async function certify(
  draft: LaunchDraft,
  registration: Registration,
  { origin = "", retry = CERTIFY_RETRY, signal }: { origin?: string; retry?: typeof CERTIFY_RETRY; signal?: AbortSignal } = {},
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await requestCertificate(draft, registration, origin);
    } catch (err) {
      if (!(err instanceof RegistrationNotSeen) || attempt >= retry.tries || signal?.aborted) throw err;
      await new Promise((r) => setTimeout(r, retry.everyMs));
    }
  }
}

/** Sign the announcement of a registered, certified launch, keep it locally and publish it to the index. */
export async function createLaunch(vault: Vault, draft: LaunchDraft, registration: Registration, certificate: string): Promise<LaunchCommitment> {
  const faults = validate(draft);
  if (Object.keys(faults).length > 0) {
    throw new Error(Object.values(faults)[0] ?? "That launch is not valid.");
  }
  const commitment = commitmentFor(draft, vault.identity, registration, certificate);
  if (!idMatches(commitment)) throw new Error("The certificate does not match this launch.");
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
