/* Checking a mint from the two chains, without trusting btc.fun.
 *
 * Given the Bitcoin transaction of a mint and the CKB transaction it settled
 * as, every rule the mint script enforced is recomputed here from raw chain
 * data: the commitment ties the two transactions together, the ticket is the
 * Bitcoin output the consumed miner cell was sealed to, the hash is recomputed
 * from the nonce the new miner cell carries, and the minted amount is the
 * token balance change. The CKB node already ran the script; this lets anyone
 * see why it passed, with the same functions and no btc.fun server involved.
 *
 * The input is data, not a network: fetching is the caller's business, so the
 * rules are testable and a verifier can feed it from any node it trusts.
 */

import { ccc } from "@ckb-ccc/core";

import { recompute } from "../mining/verify";
import { MIN_CLZ, reward, ticketChallenge } from "../standard";
import { commitment } from "./commitment";
import type { RgbppConfig } from "./config";
import { decodeTerms, tokenScript } from "./launch";
import { decodeAmount, decodeMinerCell } from "./operations";
import { PLACEHOLDER_TXID, rgbppLock, sealFromArgs } from "./seal";

export interface MintEvidence {
  btcTxid: string;
  /** Outputs of the Bitcoin transaction, as scriptPubKey hex. */
  btcOutputs: string[];
  ckbTx: ccc.Transaction;
  /** The cells the CKB transaction consumed, in input order. */
  inputs: Array<{ output: ccc.CellOutput; data: ccc.Hex }>;
}

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export interface MintVerdict {
  checks: Check[];
  valid: boolean;
  /** Atoms minted, when the transaction is a mint at all. */
  minted: bigint | null;
  launchH0: number | null;
}

/** The commitment in the first OP_RETURN, as RGB++ reads it. */
function opReturnCommitment(outputs: string[]): string | null {
  const script = outputs.find((hex) => hex.startsWith("6a"));
  if (!script || !script.startsWith("6a20") || script.length !== 68) return null;
  return "0x" + script.slice(4);
}

export function verifyMint(config: RgbppConfig, evidence: MintEvidence): MintVerdict {
  const checks: Check[] = [];
  const add = (label: string, ok: boolean, detail: string) => checks.push({ label, ok, detail });
  const tx = evidence.ckbTx;

  // 1. The Bitcoin transaction commits to this CKB transaction.
  const placeholderOutputs = tx.outputs.map((output) => {
    const lock = output.lock;
    if (lock.codeHash !== config.rgbppLock.codeHash || lock.hashType !== config.rgbppLock.hashType) return output;
    const seal = sealFromArgs(lock.args);
    const pending = seal.txid === evidence.btcTxid ? { ...seal, txid: PLACEHOLDER_TXID } : seal;
    // Built field by field: spreading a CCC CellOutput drops its capacity.
    return ccc.CellOutput.from({ capacity: output.capacity, lock: rgbppLock(config, pending), type: output.type });
  });
  const committed = commitment({
    inputs: tx.inputs.map((input) => input.previousOutput),
    outputs: placeholderOutputs,
    outputsData: tx.outputsData,
  });
  const found = opReturnCommitment(evidence.btcOutputs);
  add("commitment", found === committed, found === committed
    ? "The Bitcoin transaction's OP_RETURN commits to exactly this CKB transaction."
    : `OP_RETURN carries ${found ?? "no commitment"}, the CKB transaction hashes to ${committed}.`);

  // 2. A miner cell of the btc.fun mint script is consumed, armed.
  const isMint = (script: ccc.Script | undefined) =>
    !!script && script.codeHash === config.mint.codeHash && script.hashType === config.mint.hashType;
  const minerIndex = evidence.inputs.findIndex((input) => isMint(input.output.type));
  if (minerIndex < 0) {
    add("miner cell", false, "No miner cell of the btc.fun mint script is consumed: this is not a mint.");
    return { checks, valid: false, minted: null, launchH0: null };
  }
  const minerIn = evidence.inputs[minerIndex];
  const ticketCell = decodeMinerCell(minerIn.data);
  add("armed ticket", ticketCell?.state === "armed", ticketCell?.state === "armed"
    ? `The consumed miner cell holds a ticket, its rate fixed at block ${ticketCell.anchor}.`
    : "The consumed miner cell holds no ticket.");

  const mintType = minerIn.output.type!;
  const terms = decodeTerms(mintType.args);
  const outIndex = tx.outputs.findIndex((output) => output.type?.eq(mintType));
  const created = outIndex >= 0 ? decodeMinerCell(tx.outputsData[outIndex]) : null;
  add("disarmed", created?.state === "idle", created?.state === "idle"
    ? "The miner cell is returned idle, carrying the nonce."
    : "The miner cell is not returned idle.");

  // 3. The work: the ticket's Bitcoin output is the challenge.
  const ticket = sealFromArgs(minerIn.output.lock.args);
  const challenge = ticketChallenge(ticket.txid, ticket.vout);
  const nonce = created?.nonce ?? 0n;
  const work = recompute(challenge, nonce);
  add("proof of work", work.clz >= MIN_CLZ, `sha256d(sha256(ticket ${ticket.txid.slice(0, 12)}…:${ticket.vout}) ‖ nonce ${nonce}) = ${work.hash.slice(0, 16)}… — ${work.clz} leading zero bits (minimum ${MIN_CLZ}).`);

  // 4. The amount: this launch's balance grows by exactly the reward.
  const token = tokenScript(config, mintType);
  const sum = (cells: Array<{ type?: ccc.Script; data: ccc.Hex }>) =>
    cells.filter((c) => c.type?.eq(token)).reduce((n, c) => n + decodeAmount(c.data), 0n);
  const before = sum(evidence.inputs.map((i) => ({ type: i.output.type, data: i.data })));
  const after = sum(tx.outputs.map((o, i) => ({ type: o.type, data: tx.outputsData[i] })));
  const minted = after - before;
  const expected = ticketCell ? reward(work.clz, terms.h0, ticketCell.anchor) : 0n;
  add("amount", minted === expected, `Minted ${minted} atoms; the standard reward for ${work.clz} bits at block ${ticketCell?.anchor ?? "—"} (launch opened at ${terms.h0}) is ${expected}.`);

  return { checks, valid: checks.every((c) => c.ok), minted, launchH0: terms.h0 };
}
