/* The standard tokenomics — PROTOCOL.md §4.
 *
 * One rule set for every launch. Nothing here is a launch parameter: a creator
 * chooses identity and a payout address, never economics. The mint script on
 * CKB enforces these exact functions; this copy exists so the miner can see,
 * while it grinds, what the best hash so far would mint. Both implementations
 * pass `contracts/vectors/reward.json`, and the vectors come from an
 * independent computation rather than from either implementation.
 */

import { sha256 } from "@noble/hashes/sha2";

export const DECIMALS = 8;
/** Atoms minted per `clz²` before any halving: one whole token. */
export const UNIT = 10n ** BigInt(DECIMALS);
/** Bitcoin blocks between halvings, about one week. */
export const HALVING_BLOCKS = 1008;
/** Smallest mintable result. Below it a ticket mints nothing. */
export const MIN_CLZ = 16;
/** Price of one ticket, paid to the promoter inside the ticket transaction. */
export const TICKET_SATS = 5_000;
/** SHA-256d has 256 output bits, so no hash has more leading zeros than this. */
export const MAX_CLZ = 256;

/**
 * Halvings elapsed at `height` for a launch that opened at `h0`, or null before
 * the launch opens — a mint confirmed before `h0` is not valid at all, which is
 * a different answer from "worth zero".
 */
export function halvingsAt(h0: number, height: number): number | null {
  if (height < h0) return null;
  return Math.floor((height - h0) / HALVING_BLOCKS);
}

/**
 * Atoms one ticket mints for a hash with `clz` leading zero bits, confirmed at
 * `height`. Zero below `MIN_CLZ`, before `h0`, and from the terminal halving on.
 *
 * The shift is exact floor division by `2^k`; bigint keeps it exact past 2^53.
 */
export function reward(clz: number, h0: number, height: number): bigint {
  if (!Number.isInteger(clz) || clz < MIN_CLZ || clz > MAX_CLZ) return 0n;
  const k = halvingsAt(h0, height);
  if (k === null) return 0n;
  return (UNIT * BigInt(clz * clz)) >> BigInt(k);
}

/**
 * The first halving at which a hash with `clz` leading zeros mints nothing:
 * the smallest `k` with `2^k > UNIT × clz²`. For `MAX_CLZ` it is 43.
 */
export function terminalHalving(clz: number): number {
  const minted = UNIT * BigInt(clz * clz);
  let k = 0;
  while (minted >> BigInt(k) > 0n) k++;
  return k;
}

/** Blocks from `height` until the next halving takes effect. */
export function blocksToNextHalving(h0: number, height: number): number {
  if (height < h0) return h0 - height;
  return HALVING_BLOCKS - ((height - h0) % HALVING_BLOCKS);
}

/**
 * The 32-byte mining challenge for a ticket: `sha256(txid ‖ vout_le32)`, with
 * the txid in internal byte order (the reverse of how explorers display it).
 * The ticket output does not exist until the ticket is paid, so no work can be
 * done against it in advance, and it can be spent once, so no work is reused.
 */
export function ticketChallenge(txidDisplayHex: string, vout: number): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(txidDisplayHex)) {
    throw new RangeError("a txid is 64 lowercase hexadecimal characters");
  }
  if (!Number.isInteger(vout) || vout < 0 || vout > 0xffff_ffff) {
    throw new RangeError(`output index out of range: ${vout}`);
  }
  const outpoint = new Uint8Array(36);
  for (let i = 0; i < 32; i++) {
    outpoint[i] = parseInt(txidDisplayHex.slice(62 - 2 * i, 64 - 2 * i), 16);
  }
  new DataView(outpoint.buffer).setUint32(32, vout, true);
  return sha256(outpoint);
}
