/* What the RGB++ simulator takes as given: the deployed scripts, the service's
 * wallets, and the shapes of what it stores.
 *
 * The script identities are the testnet deployment the app is configured for;
 * the mint script's is read from `contracts/deployments/testnet.json`, the file
 * the deploy writes, so a redeploy cannot leave the simulator on a stale hash.
 */

import { readFileSync } from "node:fs";
import { ccc } from "@ckb-ccc/core";

const deployment = JSON.parse(
  readFileSync(new URL("../../../../../contracts/deployments/testnet.json", import.meta.url), "utf8"),
) as { codeHash: string; hashType: string };

export const CONFIG = {
  rgbppLock: { codeHash: "0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248" as ccc.Hex, hashType: "type" as ccc.HashType },
  xudt: { codeHash: "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb" as ccc.Hex, hashType: "type" as ccc.HashType },
  mint: { codeHash: deployment.codeHash as ccc.Hex, hashType: deployment.hashType as ccc.HashType },
};
export const PAYMASTER_ADDRESS = "tb1qt5r7g40j93s46c3mdnycc2qsz2t57xqfjddukj";
export const PAYMASTER_FEE = 7000;
export const SECP256K1_DEP_GROUP = "0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37";
export const PLATFORM_ADDRESS = "tb1q7hq7fdm88ewl4g6g7l865ltnau9f0ga76e6gye";
export const PAYMASTER_CELL = ccc.fixedPointFrom(316);
export const PLACEHOLDER = "0".repeat(64);

export interface LiveCell {
  outPoint: { txHash: ccc.Hex; index: number };
  output: ccc.CellOutput;
  data: ccc.Hex;
  live: boolean;
  blockNumber: number;
}

export interface Job {
  btcTxid: string;
  virtual: VirtualResult;
  state: "waiting" | "completed" | "failed";
  ckbTxHash: string | null;
  failure: string | null;
}

export interface VirtualResult {
  ckbRawTx: {
    cellDeps: Array<{ outPoint: { txHash: string; index: string }; depType: string }>;
    inputs: Array<{ previousOutput: { txHash: string; index: string } }>;
    outputs: Array<{ capacity: string; lock: RpcScriptCamel; type?: RpcScriptCamel }>;
    outputsData: string[];
    witnesses: string[];
  };
  commitment: string;
  needPaymasterCell: boolean;
  sumInputsCapacity: string;
}

interface RpcScriptCamel {
  codeHash: string;
  hashType: string;
  args: string;
}
