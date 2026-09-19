/* How far the search on one ticket has gone, kept across reloads.
 *
 * A ticket's challenge is fixed by its Bitcoin output, so the search over it is
 * one long sweep of the nonce space from 0 upwards, however many times it is
 * paused, reloaded or restarted. Two numbers describe it completely:
 *
 *   next  every nonce below it has been tried, so a resumed run starts there;
 *   best  the strongest candidate found, which is what a mint claims.
 *
 * Neither can be gamed: re-trying a nonce yields the same digest, and skipping
 * ahead only skips work. The kept best is re-hashed against the challenge before
 * it is believed, so an edited entry cannot be minted — the mint script would
 * refuse it anyway, but the page should not offer it.
 *
 * One store for both, under the key the best-hash store already used: entries
 * written before `next` existed still restore their best and resume from 0.
 */

import { NONCE_LIMIT, recompute } from "./verify";
import type { Candidate } from "./types";

export const PROGRESS_KEY = "btcfun:best:v1";

export interface TicketProgress {
  /** First nonce not yet known to be tried. Equal to the count of nonces tried. */
  next: bigint;
  best: Candidate | null;
}

export const NO_PROGRESS: TicketProgress = { next: 0n, best: null };

/** What is stored per ticket. Decimal strings: JSON has no bigint. */
interface StoredEntry {
  nonce?: string;
  next?: string;
}

/** The store's key for a ticket: its Bitcoin outpoint. */
export function ticketKey(txid: string, vout: number): string {
  return `${txid}:${vout}`;
}

/** The stronger of two candidates; the earlier one on a tie, so a kept best is not churned. */
export function stronger(a: Candidate | null, b: Candidate | null): Candidate | null {
  if (!a) return b;
  if (!b) return a;
  return b.clz > a.clz ? b : a;
}

/**
 * Fold what a run reports into what was known. Monotone in both fields, so a
 * late report, a second tab or a replayed sample can never move the search back.
 */
export function absorb(known: TicketProgress, frontier: bigint, best: Candidate | null): TicketProgress {
  const next = clampNonce(frontier > known.next ? frontier : known.next);
  const merged = stronger(known.best, best);
  if (next === known.next && merged === known.best) return known;
  return { next, best: merged };
}

/** Parse the raw store; anything unreadable is an empty store, never an error. */
function parse(raw: string | null): Record<string, StoredEntry> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, StoredEntry>) : {};
  } catch {
    return {};
  }
}

/** A stored decimal as a nonce in [0, 2^64], or null when it is not one. */
function parseNonce(text: unknown): bigint | null {
  if (typeof text !== "string" || !/^\d{1,20}$/.test(text)) return null;
  const n = BigInt(text);
  return n <= NONCE_LIMIT ? n : null;
}

function clampNonce(n: bigint): bigint {
  if (n < 0n) return 0n;
  return n > NONCE_LIMIT ? NONCE_LIMIT : n;
}

/** Read a ticket's progress from the raw store, re-hashing the kept best. */
export function readProgress(raw: string | null, key: string, challenge: Uint8Array): TicketProgress {
  const entry = parse(raw)[key];
  if (!entry || typeof entry !== "object") return NO_PROGRESS;
  const next = parseNonce(entry.next) ?? 0n;
  const nonce = parseNonce(entry.nonce);
  let best: Candidate | null = null;
  if (nonce !== null && nonce < NONCE_LIMIT) {
    try {
      best = recompute(challenge, nonce);
    } catch {
      best = null;
    }
  }
  return { next, best };
}

/**
 * The raw store with a ticket's progress merged in. Merging rather than
 * overwriting keeps it monotone when two tabs mine the same ticket: the store
 * ends at the furthest `next` and the stronger best, whichever tab wrote last.
 */
export function writeProgress(raw: string | null, key: string, progress: TicketProgress, challenge: Uint8Array): string {
  const all = parse(raw);
  const merged = absorb(readProgress(raw, key, challenge), progress.next, progress.best);
  const entry: StoredEntry = { next: merged.next.toString() };
  if (merged.best) entry.nonce = merged.best.nonce.toString();
  all[key] = entry;
  return JSON.stringify(all);
}

/**
 * Where a ticket's progress is kept. A port so the hook does not care that it
 * is `localStorage`, and so a blocked storage degrades to "starts from 0"
 * instead of an error.
 */
export interface ProgressStore {
  read(key: string, challenge: Uint8Array): TicketProgress;
  write(key: string, progress: TicketProgress, challenge: Uint8Array): void;
}

export const browserProgressStore: ProgressStore = {
  read(key, challenge) {
    try {
      return readProgress(localStorage.getItem(PROGRESS_KEY), key, challenge);
    } catch {
      return NO_PROGRESS;
    }
  },
  write(key, progress, challenge) {
    try {
      localStorage.setItem(PROGRESS_KEY, writeProgress(localStorage.getItem(PROGRESS_KEY), key, progress, challenge));
    } catch {
      // Storage blocked or full: the running session still holds the progress.
    }
  },
};

/**
 * The contiguous frontier of an interleaved sweep.
 *
 * Lane `i` of `stride` lanes tries `from + i`, `from + i + stride`, … in order,
 * so after lane `i` has done `counts[i]` attempts every nonce below
 * `from + stride × min(counts)` has been tried. Attempts past that point are
 * redone on resume, which costs a fraction of a second and never skips one.
 */
export function laneFrontier(from: bigint, stride: number, counts: readonly number[]): bigint {
  if (counts.length === 0) return from;
  let min = counts[0];
  for (const c of counts) if (c < min) min = c;
  return clampNonce(from + BigInt(stride) * BigInt(min));
}

/** A 64-bit nonce as the two u32 words the worker and the shader take. Wraps at 2^64. */
export function nonceWords(n: bigint): { lo: number; hi: number } {
  const v = ((n % NONCE_LIMIT) + NONCE_LIMIT) % NONCE_LIMIT;
  return { lo: Number(v & 0xffffffffn), hi: Number(v >> 32n) };
}
