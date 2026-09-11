/* The CKB scripts a btc.fun token involves, on the network this build uses.
 *
 * The RGB++ lock and the xUDT are the deployments the RGB++ SDK names for CKB
 * testnet paired with Bitcoin testnet3 (`rgbpp-sdk` `TestnetInfo`). The mint
 * script is ours, read from the deployment record so the address the app uses
 * is the one the deploy script wrote, never a second hand-typed copy.
 */

import { ccc } from "@ckb-ccc/core";
import deployment from "../../../../../contracts/deployments/testnet.json";

export interface ScriptIdentity {
  codeHash: ccc.Hex;
  hashType: ccc.HashType;
}

export interface RgbppConfig {
  rgbppLock: ScriptIdentity;
  /** Code first, config second: the lock reads its config from the next cell. */
  rgbppLockDeps: ccc.CellDepLike[];
  xudt: ScriptIdentity;
  xudtDep: ccc.CellDepLike;
  mint: ScriptIdentity;
  mintDep: ccc.CellDepLike;
  /** RGB++ assets service: SPV proofs, the transaction queue and the paymaster. */
  service: string;
  /** Explorer page for a CKB transaction. */
  ckbExplorer: string;
}

const RGBPP_DEPLOY_TX = "0x0d1567da0979f78b297d5311442669fbd1bd853c8be324c5ab6da41e7a1ed6e5";

export const TESTNET: RgbppConfig = {
  rgbppLock: {
    codeHash: "0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248",
    hashType: "type",
  },
  rgbppLockDeps: [
    { outPoint: { txHash: RGBPP_DEPLOY_TX, index: 0 }, depType: "code" },
    { outPoint: { txHash: RGBPP_DEPLOY_TX, index: 1 }, depType: "code" },
  ],
  xudt: {
    codeHash: "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb",
    hashType: "type",
  },
  xudtDep: {
    outPoint: { txHash: "0xbf6fb538763efec2a70a6a3dcb7242787087e1030c4e7d86585bc63a9d337f5f", index: 0 },
    depType: "code",
  },
  mint: { codeHash: deployment.codeHash as ccc.Hex, hashType: deployment.hashType as ccc.HashType },
  mintDep: {
    outPoint: {
      txHash: deployment.cellDep.outPoint.txHash as ccc.Hex,
      index: Number(deployment.cellDep.outPoint.index),
    },
    depType: "code",
  },
  service: import.meta.env.VITE_RGBPP_SERVICE ?? "https://api.testnet.rgbpp.io",
  ckbExplorer: "https://testnet.explorer.nervos.org/transaction/",
};

export const ACTIVE_RGBPP = TESTNET;
