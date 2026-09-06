/* Creating a launch.
 *
 * A launch is a public commitment, so it is a signed object rather than a row
 * somebody inserted: the creator's key authorises the symbol, the schedule, the
 * ticket price and the opening height, and anyone can check that the launch
 * they are mining is the one that was announced.
 *
 * Created launches live alongside the fixtures. They come back from the index
 * as `launch` activity events, and a local copy keeps the creator's own launch
 * visible when the index is unreachable — the same first-local-then-publish
 * ordering the rest of the app uses.
 */

import { canonicalDigest, canonicalId, type Field } from "../canonical";
import { record, signActivity } from "../activity";
import type { Vault } from "../bitcoin";
import { CANDIDATE } from "../emission";
import type { LaunchSpec } from "../../data/launches";

const LOCAL_KEY = "btcfun:created-launches:v1";

/** Reserved ids: the fixture launches, so a creation cannot shadow one. */
const RESERVED = new Set(["mesh", "obsv", "forge", "quill", "tide", "lumen", "cairn", "relic"]);

/** The signed part of a launch. Mirrors `LaunchSpec` minus derived display. */
export interface LaunchCommitment {
  v: "btcfun/launch/1";
  id: string;
  symbol: string;
  name: string;
  blurb: string;
  /** Bitcoin height at which mining opens. Committed in advance (§5). */
  h0: number;
  epochBlocks: number;
  halfLife: number;
  decimals: number;
  ticketSats: number;
  minClz: number;
  accent: string;
  creator: string;
  at: string;
}

function fieldsOf(c: LaunchCommitment): Field[] {
  return [
    ["v", c.v],
    ["id", c.id],
    ["symbol", c.symbol],
    ["name", c.name],
    ["blurb", c.blurb],
    ["h0", String(c.h0)],
    ["epochBlocks", String(c.epochBlocks)],
    ["halfLife", String(c.halfLife)],
    ["decimals", String(c.decimals)],
    ["ticketSats", String(c.ticketSats)],
    ["minClz", String(c.minClz)],
    ["accent", c.accent],
    ["creator", c.creator],
    ["at", c.at],
  ];
}

export function commitmentDigest(c: LaunchCommitment): Uint8Array {
  return canonicalDigest(fieldsOf(c));
}

export function commitmentId(c: LaunchCommitment): string {
  return canonicalId(fieldsOf(c));
}

export interface LaunchDraft {
  symbol: string;
  name: string;
  blurb: string;
  /** Blocks from now until mining opens. Never zero: §5 wants a future h0. */
  opensInBlocks: number;
  epochBlocks: number;
  halfLife: number;
  decimals: number;
  ticketSats: number;
  minClz: number;
  accent: string;
}

/** Field-level problems, keyed by field, so a form can show them in place. */
export type DraftFaults = Partial<Record<keyof LaunchDraft, string>>;

export function validate(draft: LaunchDraft): DraftFaults {
  const faults: DraftFaults = {};

  const symbol = draft.symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(symbol)) {
    faults.symbol = "2–8 characters, letters and digits, starting with a letter.";
  } else if (RESERVED.has(idFor(symbol))) {
    faults.symbol = "That symbol is already taken.";
  }

  if (draft.name.trim().length < 2 || draft.name.trim().length > 40) {
    faults.name = "Between 2 and 40 characters.";
  }
  if (draft.blurb.trim().length < 10 || draft.blurb.trim().length > 160) {
    faults.blurb = "Between 10 and 160 characters — one sentence people will read.";
  }
  // A launch that opens in the past cannot commit to a future block, which is
  // what stops a creator mining their own launch before announcing it (§5).
  if (!Number.isInteger(draft.opensInBlocks) || draft.opensInBlocks < 1) {
    faults.opensInBlocks = "Must open at a future block.";
  }
  if (!Number.isInteger(draft.epochBlocks) || draft.epochBlocks < 1 || draft.epochBlocks > 144) {
    faults.epochBlocks = "Between 1 and 144 blocks.";
  }
  if (!Number.isInteger(draft.halfLife) || draft.halfLife < 36 || draft.halfLife > 20_160) {
    faults.halfLife = "Between 36 and 20,160 blocks.";
  }
  if (!Number.isInteger(draft.decimals) || draft.decimals < 0 || draft.decimals > 12) {
    faults.decimals = "Between 0 and 12.";
  }
  if (!Number.isInteger(draft.ticketSats) || draft.ticketSats < 546) {
    faults.ticketSats = "At least 546 sats, the relay dust limit.";
  }
  if (!Number.isInteger(draft.minClz) || draft.minClz < 8 || draft.minClz > 32) {
    faults.minClz = "Between 8 and 32 bits. Above 28 takes minutes on a CPU.";
  }

  return faults;
}

export function isReady(draft: LaunchDraft): boolean {
  return Object.keys(validate(draft)).length === 0;
}

/** Launch id: the lowercase symbol. Short, readable, and the URL. */
export function idFor(symbol: string): string {
  return symbol.trim().toLowerCase();
}

/** Build the commitment a draft implies, given the height it is signed at. */
export function commitmentFor(
  draft: LaunchDraft,
  creator: string,
  tipHeight: number,
): LaunchCommitment {
  const symbol = draft.symbol.trim().toUpperCase();
  return {
    v: "btcfun/launch/1",
    id: idFor(symbol),
    symbol,
    name: draft.name.trim(),
    blurb: draft.blurb.trim(),
    h0: tipHeight + draft.opensInBlocks,
    epochBlocks: draft.epochBlocks,
    halfLife: draft.halfLife,
    decimals: draft.decimals,
    ticketSats: draft.ticketSats,
    minClz: draft.minClz,
    accent: draft.accent,
    creator,
    at: new Date().toISOString(),
  };
}

/** Sign the commitment, keep it locally and publish it to the index. */
export async function createLaunch(
  vault: Vault,
  draft: LaunchDraft,
  tipHeight: number,
): Promise<LaunchCommitment> {
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
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LaunchCommitment[]) : [];
  } catch {
    return [];
  }
}

function remember(commitment: LaunchCommitment): void {
  const existing = readLocal().filter((c) => c.id !== commitment.id);
  localStorage.setItem(LOCAL_KEY, JSON.stringify([commitment, ...existing].slice(0, 50)));
}

export function createdLocally(): LaunchCommitment[] {
  return readLocal();
}

export function forgetCreated(id: string): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(readLocal().filter((c) => c.id !== id)));
}

/** Turn a commitment into a spec the rest of the app can render.
 *
 *  `blocksSinceOpen` is derived from the committed `h0` rather than stored, so
 *  a created launch ages against the chain exactly like a fixture does. */
export function specFor(commitment: LaunchCommitment, tipHeight: number): LaunchSpec {
  const age = tipHeight - commitment.h0;
  return {
    id: commitment.id,
    symbol: commitment.symbol,
    name: commitment.name,
    blurb: commitment.blurb,
    state: age >= 0 ? "mining" : "committed",
    blocksSinceOpen: age,
    epochBlocks: commitment.epochBlocks,
    ticketSats: commitment.ticketSats,
    minClz: commitment.minClz,
    reserve: 0n,
    addresses: 0,
    schedule: {
      ...CANDIDATE,
      halfLife: BigInt(commitment.halfLife),
      decimals: commitment.decimals,
    },
    accent: commitment.accent,
    createdBy: commitment.creator,
  };
}
