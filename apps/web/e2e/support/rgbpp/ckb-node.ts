/* A CKB node's JSON-RPC, answered from the simulator's cells.
 *
 * Only the calls the app makes are answered — cells by script, a live cell, a
 * committed transaction, the tip — and any other method is recorded as
 * unexpected, so a test notices when the app starts asking for more.
 */

import type { Route } from "@playwright/test";
import { ccc } from "@ckb-ccc/core";

import type { RgbppSim } from "./index";

export async function answerRpc(sim: RgbppSim, route: Route): Promise<void> {
  const payload = JSON.parse(route.request().postData() ?? "null");
  const one = (call: { id: number; method: string; params: unknown[] }) => ({ jsonrpc: "2.0", id: call.id, result: answerCall(sim, call.method, call.params) });
  return route.fulfill({ json: Array.isArray(payload) ? payload.map(one) : one(payload) });
}

function answerCall(sim: RgbppSim, method: string, params: unknown[]): unknown {
  const rpcScript = (s: ccc.Script) => ({ code_hash: s.codeHash, hash_type: s.hashType, args: s.args });
  const rpcOutput = (o: ccc.CellOutput) => ({ capacity: ccc.numToHex(o.capacity), lock: rpcScript(o.lock), type: o.type ? rpcScript(o.type) : null });
  switch (method) {
    case "get_cells": {
      const [key, , limit, after] = params as [{ script: { code_hash: string; hash_type: string; args: string }; script_type: string }, string, string, string | null];
      const wanted = ccc.Script.from({ codeHash: key.script.code_hash, hashType: key.script.hash_type as ccc.HashType, args: key.script.args });
      const matches = [...sim.cells.values()].filter((c) => c.live && (key.script_type === "type" ? c.output.type?.eq(wanted) : c.output.lock.eq(wanted)));
      const start = after ? Number(after) : 0;
      const page = matches.slice(start, start + Number(limit));
      return {
        objects: page.map((c) => ({
          output: rpcOutput(c.output),
          output_data: c.data,
          out_point: { tx_hash: c.outPoint.txHash, index: ccc.numToHex(c.outPoint.index) },
          block_number: ccc.numToHex(c.blockNumber),
          tx_index: "0x0",
        })),
        last_cursor: ccc.numToHex(start + page.length),
      };
    }
    case "get_live_cell": {
      const [outPoint] = params as [{ tx_hash: string; index: string }];
      const cell = sim.cells.get(`${outPoint.tx_hash}:${Number(outPoint.index)}`);
      if (!cell || !cell.live) return { cell: null, status: "unknown" };
      return { cell: { output: rpcOutput(cell.output), data: { content: cell.data, hash: ccc.hashCkb(cell.data) } }, status: "live" };
    }
    case "get_transaction": {
      const [hash] = params as [string];
      const tx = sim.transactions.get(hash);
      if (!tx) return null;
      return {
        transaction: {
          version: "0x0",
          cell_deps: [],
          header_deps: [],
          inputs: tx.inputs.map((i) => ({ previous_output: { tx_hash: i.previousOutput.txHash, index: ccc.numToHex(i.previousOutput.index) }, since: "0x0" })),
          outputs: tx.outputs.map(rpcOutput),
          outputs_data: tx.outputsData,
          witnesses: tx.witnesses,
          hash,
        },
        tx_status: { status: "committed", block_hash: "0x" + "00".repeat(32), block_number: "0x1", reason: null },
        cycles: null,
      };
    }
    case "get_tip_header":
      return { number: ccc.numToHex(sim.blockNumber), hash: "0x" + "00".repeat(32), epoch: "0x0", timestamp: "0x0", parent_hash: "0x" + "00".repeat(32), compact_target: "0x0", nonce: "0x0", transactions_root: "0x" + "00".repeat(32), proposals_hash: "0x" + "00".repeat(32), extra_hash: "0x" + "00".repeat(32), dao: "0x" + "00".repeat(32), version: "0x0" };
    default:
      sim.unexpected.push(`ckb ${method}`);
      return null;
  }
}
