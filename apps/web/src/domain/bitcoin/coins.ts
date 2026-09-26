/* Coin selection: which UTXOs a transaction spends and what it pays the miner.
 *
 * One algorithm for every transaction this app signs — a plain payment, an
 * RGB++ operation whose seals must be spent, and a purchase that completes a
 * seller's partially signed transaction. They differ only in what is already
 * in the transaction before any coin is picked, and the request says so
 * instead of each caller keeping a loop of its own.
 *
 * The fee is computed from the actual transaction shape rather than guessed,
 * and selection iterates: adding an input to cover a fee raises the fee, so a
 * single pass can produce a transaction that cannot pay for itself. The
 * estimate assumes a 72-byte signature, the maximum, so the finalised
 * transaction is never larger than estimated; `assertFeeCovers` checks anyway,
 * turning a future estimator mistake into an exception here rather than a
 * transaction that sits unconfirmed.
 */

import { DUST_SATS } from "./network";
import { estimateVsize, P2WPKH_SCRIPT_BYTES } from "./size";
import type { Utxo } from "./types";

export interface Selection {
  /** Every input this wallet signs: the mandatory ones first, then the coins picked. */
  inputs: Utxo[];
  /** Satoshis paid out, change excluded. */
  amount: number;
  /** Satoshis returned to the sender, 0 when the remainder is dust. */
  change: number;
  /** Satoshis left to the miner — remainder below dust is added here. */
  fee: number;
  vsize: number;
  /** Satoshis per virtual byte this selection actually pays. */
  feeRate: number;
}

export class InsufficientFunds extends Error {
  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super(
      `Not enough confirmed balance: need ${required} sats including fee, have ${available}.`,
    );
    this.name = "InsufficientFunds";
  }
}

export class FeeTooLow extends Error {
  constructor(
    readonly paid: number,
    readonly vsize: number,
    readonly requested: number,
  ) {
    super(
      `Transaction pays ${paid} sats over ${vsize} vB — ${(paid / vsize).toFixed(3)} sat/vB, ` +
        `below the requested ${requested}.`,
    );
    this.name = "FeeTooLow";
  }
}

/** Inputs the transaction already carries that this wallet does not sign. */
export interface ForeignInputs {
  /** How many, each sized as a P2WPKH input. */
  count: number;
  /** What they bring, in satoshis. */
  value: number;
}

export interface SelectionRequest {
  /** Coins to pick from, taken in the order given (callers pass largest-first). */
  utxos: readonly Utxo[];
  /** Satoshis of every output except change, summed. */
  amount: number;
  /** Satoshis per virtual byte to pay. */
  feeRate: number;
  /**
   * scriptPubKey lengths of every output except change, recipient first.
   * An OP_RETURN memo belongs here too — it costs vbytes like anything else.
   */
  outputScripts: readonly number[];
  /** scriptPubKey length of the change output, if one is created. */
  changeScript?: number;
  /**
   * Inputs spent whatever the arithmetic says: the sealed UTXOs an RGB++
   * operation consumes. Signed by this wallet and counted towards the amount.
   */
  mandatory?: readonly Utxo[];
  /**
   * Inputs already in the transaction that someone else signed — a seller's
   * sealed output under SINGLE|ANYONECANPAY. Sized and counted, never picked.
   */
  foreign?: ForeignInputs;
}

const NO_FOREIGN: ForeignInputs = { count: 0, value: 0 };

/**
 * Pick inputs for a transaction at `feeRate` sat/vB.
 *
 * Coins are taken in order, and callers pass them largest-first: fewest
 * inputs, so the smallest fee and the least UTXO fragmentation. Not
 * privacy-optimal — a launchpad demo on testnet has no privacy model to
 * protect — and that trade-off is deliberate rather than accidental.
 *
 * A selection always has at least one input this wallet signs, even when the
 * foreign inputs alone would cover the outputs: a transaction the wallet did
 * not sign is not one it can call its own.
 */
export function selectCoins(request: SelectionRequest): Selection {
  const { utxos, amount, feeRate, outputScripts } = request;
  const changeScript = request.changeScript ?? P2WPKH_SCRIPT_BYTES;
  const mandatory = request.mandatory ?? [];
  const foreign = request.foreign ?? NO_FOREIGN;

  if (!Number.isInteger(amount) || amount <= 0) throw new RangeError("amount must be positive sats");
  if (amount < DUST_SATS) throw new RangeError(`amount below the ${DUST_SATS} sat dust limit`);
  if (!(feeRate > 0)) throw new RangeError("feeRate must be positive");
  if (outputScripts.length === 0) throw new RangeError("a payment needs at least one output");
  if (!Number.isInteger(foreign.count) || foreign.count < 0 || !Number.isInteger(foreign.value) || foreign.value < 0) {
    throw new RangeError("foreign inputs are a count and a value, both whole and non-negative");
  }

  const inputs: Utxo[] = [...mandatory];
  let gathered = foreign.value + inputs.reduce((sum, u) => sum + u.value, 0);
  const available = gathered + utxos.reduce((sum, u) => sum + u.value, 0);
  const pool = [...utxos];

  for (;;) {
    // Assume change exists; if it turns out to be dust we drop it below, which
    // only ever makes the transaction smaller and the fee sufficient.
    const count = inputs.length + foreign.count;
    const withChange = estimateVsize(Math.max(1, count), [...outputScripts, changeScript]);
    const fee = Math.ceil(withChange * feeRate);

    if (inputs.length > 0 && gathered >= amount + fee) {
      const remainder = gathered - amount - fee;
      if (remainder >= DUST_SATS) {
        return { inputs, amount, change: remainder, fee, vsize: withChange, feeRate: fee / withChange };
      }
      // Remainder is unspendable as an output: drop the change output and let
      // it go to the miner. Recompute the size so the reported fee is the real one.
      const withoutChange = estimateVsize(count, outputScripts);
      const paid = gathered - amount;
      return { inputs, amount, change: 0, fee: paid, vsize: withoutChange, feeRate: paid / withoutChange };
    }

    const next = pool.shift();
    if (!next) throw new InsufficientFunds(amount + fee, available);
    inputs.push(next);
    gathered += next.value;
  }
}

/**
 * The fee a finalised transaction pays must reach the rate that was asked for,
 * measured over the size a node will measure. Throws `FeeTooLow` otherwise.
 */
export function assertFeeCovers(fee: number, vsize: number, feeRate: number): void {
  if (fee < vsize * feeRate) throw new FeeTooLow(fee, vsize, feeRate);
}
