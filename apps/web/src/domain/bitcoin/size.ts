/* Virtual size of a P2WPKH transaction, from its shape.
 *
 * Sizes in the units the consensus rule actually uses: base bytes count four
 * times, witness bytes once, and vsize is the total weight divided by four,
 * rounded up. Writing it this way rather than as per-output vbyte constants is
 * what lets a 22-byte P2WPKH script and an 83-byte OP_RETURN both be right.
 *
 * Size is derived from the real scriptPubKeys, not from an output count. An
 * OP_RETURN carrying 80 bytes is 92 vB where a P2WPKH output is 31, so counting
 * outputs instead of measuring them underpays the fee by roughly 40% on exactly
 * the transactions this app builds — every ticket and every offer fill carries a
 * memo or a commitment.
 */

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
