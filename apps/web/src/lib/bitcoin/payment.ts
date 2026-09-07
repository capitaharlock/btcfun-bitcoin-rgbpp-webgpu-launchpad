/* Building and signing a P2WPKH payment.
 *
 * Coin selection and size estimation are pure functions over plain data, so the
 * part that decides how much money moves is unit-testable without a key, a
 * network or a browser. `buildPayment` is the only function that touches secret
 * material, and it does so inside the vault's `use()` callback.
 *
 * The fee is computed from the actual transaction shape rather than guessed,
 * and selection iterates: adding an input to cover a fee raises the fee, so a
 * single pass can produce a transaction that cannot pay for itself.
 *
 * Size is derived from the real scriptPubKeys, not from an output count. An
 * OP_RETURN carrying 80 bytes is 92 vB where a P2WPKH output is 31, so counting
 * outputs instead of measuring them underpays the fee by roughly 40% on exactly
 * the transactions this app builds — every ticket and every offer fill carries a
 * memo. The estimate is then checked against the finalised transaction, so an
 * underpayment becomes an exception here rather than a stuck payment on chain.
 */

import { Address, OutScript, Transaction } from "@scure/btc-signer";

import { DUST_SATS, ACTIVE, type NetworkConfig } from "./network";
import type { WalletKey } from "./keys";
import type { Utxo } from "./provider";

/* Sizes in the units the consensus rule actually uses: base bytes count four
 * times, witness bytes once, and vsize is the total weight divided by four,
 * rounded up. Writing it this way rather than as per-output vbyte constants is
 * what lets a 22-byte P2WPKH script and an 83-byte OP_RETURN both be right. */

/** Outpoint 32+4, empty scriptSig length 1, sequence 4. */
const INPUT_BASE_BYTES = 41;
/** Witness stack: 1 item count + (1+72) signature + (1+33) pubkey, in weight. */
const INPUT_WITNESS_WU = 108;
/** Version 4 + locktime 4. Count varints are added per call. */
const TX_BASE_BYTES = 8;
/** SegWit marker and flag, which live in the witness. */
const SEGWIT_OVERHEAD_WU = 2;
/** `OP_0 <20-byte hash>` — the scriptPubKey every wallet address here uses. */
export const P2WPKH_SCRIPT_BYTES = 22;
/** Largest payload an OP_RETURN may carry and still be relayed by default. */
export const MAX_MEMO_BYTES = 80;

/** Serialised size of a CompactSize integer. */
function varIntBytes(value: number): number {
  if (value < 0xfd) return 1;
  if (value <= 0xffff) return 3;
  if (value <= 0xffff_ffff) return 5;
  return 9;
}

/** Amount 8 + scriptPubKey length prefix + the script itself. */
function outputBytes(scriptBytes: number): number {
  return 8 + varIntBytes(scriptBytes) + scriptBytes;
}

/**
 * Virtual size of a transaction spending `inputs` P2WPKH outputs and paying to
 * the given scriptPubKeys, measured in bytes.
 *
 * Takes the scripts rather than a count because that is the only input that
 * makes the answer correct for a transaction carrying an OP_RETURN.
 */
export function estimateVsize(inputs: number, outputScripts: readonly number[]): number {
  const base =
    TX_BASE_BYTES +
    varIntBytes(inputs) +
    inputs * INPUT_BASE_BYTES +
    varIntBytes(outputScripts.length) +
    outputScripts.reduce((sum, script) => sum + outputBytes(script), 0);
  const witness = inputs > 0 ? SEGWIT_OVERHEAD_WU + inputs * INPUT_WITNESS_WU : 0;
  return Math.ceil((base * 4 + witness) / 4);
}

/** The scriptPubKey an OP_RETURN memo compiles to. */
export function opReturnScriptBytes(memoBytes: number): number {
  // OP_RETURN, then a direct push under 76 bytes or PUSHDATA1 plus a length.
  return 1 + (memoBytes < 76 ? 1 : 2) + memoBytes;
}

export interface Selection {
  inputs: Utxo[];
  /** Satoshis paid to the recipient. */
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

export interface SelectionRequest {
  utxos: readonly Utxo[];
  /** Satoshis to the recipient. */
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
}

/**
 * Pick inputs for a payment at `feeRate` sat/vB.
 *
 * Largest-first: fewest inputs, so the smallest fee and the least UTXO
 * fragmentation. Not privacy-optimal — a launchpad demo on testnet has no
 * privacy model to protect — and that trade-off is deliberate rather than
 * accidental.
 */
export function selectCoins(request: SelectionRequest): Selection {
  const { utxos, amount, feeRate, outputScripts } = request;
  const changeScript = request.changeScript ?? P2WPKH_SCRIPT_BYTES;

  if (!Number.isInteger(amount) || amount <= 0) throw new RangeError("amount must be positive sats");
  if (amount < DUST_SATS) throw new RangeError(`amount below the ${DUST_SATS} sat dust limit`);
  if (!(feeRate > 0)) throw new RangeError("feeRate must be positive");
  if (outputScripts.length === 0) throw new RangeError("a payment needs at least one output");

  const available = utxos.reduce((sum, u) => sum + u.value, 0);
  const inputs: Utxo[] = [];
  let gathered = 0;

  for (const utxo of utxos) {
    inputs.push(utxo);
    gathered += utxo.value;

    // Assume change exists; if it turns out to be dust we drop it below, which
    // only ever makes the transaction smaller and the fee sufficient.
    const withChange = estimateVsize(inputs.length, [...outputScripts, changeScript]);
    const fee = Math.ceil(withChange * feeRate);
    if (gathered < amount + fee) continue;

    const remainder = gathered - amount - fee;
    if (remainder >= DUST_SATS) {
      return { inputs, amount, change: remainder, fee, vsize: withChange, feeRate: fee / withChange };
    }

    // Remainder is unspendable as an output: drop the change output and let it
    // go to the miner. Recompute the size so the reported fee is the real one.
    const withoutChange = estimateVsize(inputs.length, outputScripts);
    const paid = gathered - amount;
    return {
      inputs,
      amount,
      change: 0,
      fee: paid,
      vsize: withoutChange,
      feeRate: paid / withoutChange,
    };
  }

  const shortfall =
    amount +
    Math.ceil(
      estimateVsize(Math.max(1, inputs.length), [...outputScripts, changeScript]) * feeRate,
    );
  throw new InsufficientFunds(shortfall, available);
}

export interface PaymentRequest {
  to: string;
  amountSats: number;
  feeRate: number;
  utxos: readonly Utxo[];
  /** Arbitrary bytes to commit in an OP_RETURN, at most 80. */
  memo?: Uint8Array;
}

export interface SignedPayment {
  hex: string;
  txid: string;
  selection: Selection;
  /** Virtual size of the finalised transaction, as a node will measure it. */
  vsize: number;
}

/**
 * Build, sign and finalise the payment. Returns broadcast-ready hex.
 *
 * Nothing is sent here: broadcasting is a separate, explicit step, so a caller
 * can show the visitor exactly what they are about to publish first.
 */
export function buildPayment(
  key: WalletKey,
  request: PaymentRequest,
  network: NetworkConfig = ACTIVE,
): SignedPayment {
  if (request.memo && request.memo.length > MAX_MEMO_BYTES) {
    throw new RangeError(`OP_RETURN memo exceeds ${MAX_MEMO_BYTES} bytes`);
  }

  // Measure the outputs before choosing coins. Doing it the other way round is
  // what let the OP_RETURN escape the fee calculation.
  const recipientScript = scriptFor(request.to, network);
  const memoScript = request.memo ? opReturn(request.memo) : null;
  const outputScripts = [recipientScript.length, ...(memoScript ? [memoScript.length] : [])];

  const selection = selectCoins({
    utxos: request.utxos,
    amount: request.amountSats,
    feeRate: request.feeRate,
    outputScripts,
    changeScript: key.script.length,
  });

  const tx = new Transaction({ allowUnknownOutputs: !!memoScript });

  for (const utxo of selection.inputs) {
    tx.addInput({
      txid: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: key.script, amount: BigInt(utxo.value) },
    });
  }

  tx.addOutput({ script: recipientScript, amount: BigInt(selection.amount) });
  if (selection.change > 0) {
    tx.addOutput({ script: key.script, amount: BigInt(selection.change) });
  }
  if (memoScript) tx.addOutput({ script: memoScript, amount: 0n });

  tx.sign(key.privateKey);
  tx.finalize();

  // The estimate assumes a 72-byte signature, which is the maximum; a real one
  // is sometimes shorter, so the finalised transaction is never *larger* than
  // estimated. Checking anyway turns any future estimator mistake into a loud
  // failure here instead of a transaction that sits unconfirmed.
  if (selection.fee < tx.vsize * request.feeRate) {
    throw new FeeTooLow(selection.fee, tx.vsize, request.feeRate);
  }

  return { hex: tx.hex, txid: tx.id, selection, vsize: tx.vsize };
}

/** The scriptPubKey an address pays to, on the active network. */
function scriptFor(address: string, network: NetworkConfig): Uint8Array {
  return OutScript.encode(Address(network.params).decode(address));
}

/** `OP_RETURN <push> <data>` for a payload of at most 80 bytes. */
function opReturn(data: Uint8Array): Uint8Array {
  const prefix =
    data.length < 76 ? Uint8Array.of(0x6a, data.length) : Uint8Array.of(0x6a, 0x4c, data.length);
  const script = new Uint8Array(prefix.length + data.length);
  script.set(prefix, 0);
  script.set(data, prefix.length);
  return script;
}
