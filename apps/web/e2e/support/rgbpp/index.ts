/* A simulated RGB++ service, CKB node and activity index, for the
 * deterministic project.
 *
 * `RgbppSim` holds the state the three share — the CKB cells, the queued jobs,
 * the index's events — and routes each service to its module:
 *
 *   service.ts     the RGB++ service and its queue
 *   mint-rules.ts  the mint script's rules, checked on every committed transaction
 *   ckb-node.ts    the CKB node's JSON-RPC
 *   index-api.ts   btc.fun's activity index and certificate signer
 *   oracle.ts      the standard and the cell encodings, restated
 *
 * The rules are restated as a test oracle, not imported from the app, so a
 * client that built the wrong transaction fails here instead of passing
 * because both sides share its mistake. The Rust script is the authority;
 * `contracts/tests` checks it, and this mirrors it.
 */

import type { Page } from "@playwright/test";
import { ccc } from "@ckb-ccc/core";
import { Address, OutScript, TEST_NETWORK } from "@scure/btc-signer";

import type { SignedActivity } from "../../../src/lib/activity/types";
import type { ChainSim } from "../chain";
import { CKB_RPC, RGBPP_SERVICE } from "../endpoints";
import { answerRpc } from "./ckb-node";
import type { Job, LiveCell } from "./constants";
import { answerCertify, answerIndex } from "./index-api";
import { answerService, settle } from "./service";

export { CKB_RPC, RGBPP_SERVICE as SERVICE } from "../endpoints";
export { PAYMASTER_ADDRESS, PAYMASTER_FEE, PLATFORM_ADDRESS } from "./constants";

export class RgbppSim {
  readonly cells = new Map<string, LiveCell>();
  readonly transactions = new Map<string, ccc.Transaction>();
  readonly jobs = new Map<string, Job>();
  readonly events: Array<{ id: string; signed: SignedActivity; receivedAt: number; authentic: true }> = [];
  readonly unexpected: string[] = [];
  /** When true, the queue leaves every job waiting. */
  stalled = false;
  /** How many certificate requests to answer as if Bitcoin had not seen the registration yet. */
  unseenCertifications = 0;
  /** The CKB tip, advanced once per committed transaction. */
  blockNumber = 1;

  constructor(readonly chain: ChainSim) {
    chain.onBlock.push(() => this.settle());
  }

  async install(page: Page): Promise<void> {
    await page.route(`${RGBPP_SERVICE}/**`, (route) => answerService(this, route));
    await page.route(`${CKB_RPC}**`, (route) => answerRpc(this, route));
    await page.route("**/api/activity**", (route) => answerIndex(this, route));
    await page.route("**/api/certify", (route) => answerCertify(this, route));
  }

  /** Complete every waiting job whose Bitcoin transaction now has a block. */
  settle(): void {
    settle(this);
  }

  /** Seed a transaction's outputs as if it were already on chain (for fixtures). */
  seedTransaction(tx: ccc.Transaction): string {
    const hash = tx.hash();
    this.transactions.set(hash, tx);
    tx.outputs.forEach((output, index) => {
      this.cells.set(`${hash}:${index}`, { outPoint: { txHash: hash, index }, output, data: tx.outputsData[index], live: true, blockNumber: 1 });
    });
    return hash;
  }
}

/** The address a scriptPubKey pays, for assertions. */
export function addressOfScript(script: Uint8Array): string {
  return Address(TEST_NETWORK).encode(OutScript.decode(script));
}
