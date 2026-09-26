import { describe, expect, it } from "vitest";

import { deriveKey, TESTNET3, type Utxo } from "@/domain/bitcoin";
import type { Plan } from "@/domain/rgbpp";
import type { DeviceStore, QueueState, Vault } from "@/ports";
import { operationsStore } from "./operations-store";
import { submitOperation, type SubmitPorts } from "./submit";

const key = deriveKey(new Uint8Array(32).fill(9), TESTNET3);
const vault: Vault = { kind: "local", address: key.address, identity: "02" + "ab".repeat(32), label: "test", use: async (fn) => fn(key) };

const TXID = "aa".repeat(32);
const LANDING = "bb".repeat(32);

/** A plan whose Bitcoin side is signed by the test's own signer, so no real transaction is built. */
const plan: Plan = {
  virtualTx: { inputs: [], outputs: [], outputsData: [] },
  cellDeps: [],
  commitment: `0x${"00".repeat(32)}`,
  btcOutputs: [],
  sealsSpent: [],
  needPaymasterCell: false,
  sumInputsCapacity: 0n,
};

const coin = (txid: string): Utxo => ({ txid, vout: 0, value: 50_000, confirmed: true });

/** A device store in memory, so the real operations store runs over it. */
function memoryStore(): DeviceStore {
  const map = new Map<string, string>();
  return {
    read: (key) => map.get(key) ?? null,
    write: (key, value) => (value === null ? map.delete(key) : map.set(key, value), true),
    readList: <T,>(key: string): T[] => JSON.parse(map.get(key) ?? "[]") as T[],
    writeList: (key, items) => (map.set(key, JSON.stringify(items)), true),
  };
}

interface World {
  ports: SubmitPorts;
  /** What the signer was offered as plain funding. */
  offered: Utxo[];
  enqueued: string[];
}

function world({ broadcastTxid = TXID, queue = "waiting" as QueueState | Error } = {}): World {
  const store = operationsStore(memoryStore());
  const w: World = { offered: [], enqueued: [], ports: null as unknown as SubmitPorts };
  w.ports = {
    vault,
    chain: { getUtxos: async () => [coin(TXID), coin(LANDING)], getFeeRate: async () => 4 },
    rgbpp: {
      freeUtxos: async () => [coin("cc".repeat(32)), coin(LANDING)],
      broadcast: async () => broadcastTxid,
      enqueue: async (_plan, btcTxid) => {
        w.enqueued.push(btcTxid);
        if (queue instanceof Error) throw queue;
        return queue;
      },
    },
    store,
    now: () => new Date("2026-09-26T00:00:00Z"),
  };
  return w;
}

const sign = (offered: Utxo[]) => (_key: unknown, _sealed: Utxo[], free: Utxo[]) => {
  offered.push(...free);
  return { hex: "deadbeef", txid: TXID };
};

const meta = { kind: "mint", launchId: "mesh-0000000000000000", tokenId: "0x" + "ee".repeat(32), atoms: "5" } as const;

describe("submitOperation", () => {
  it("signs, broadcasts, enqueues and records the operation as queued", async () => {
    const w = world();
    const op = await submitOperation(w.ports, plan, meta, { sign: sign(w.offered) });
    expect(op).toMatchObject({ ...meta, btcTxid: TXID, stage: "queued", ckbTxHash: null, failure: null, at: "2026-09-26T00:00:00.000Z" });
    expect(w.enqueued).toEqual([TXID]);
    expect(w.ports.store.read(vault.address)).toEqual([op]);
  });

  it("keeps the spend recorded when the queue refuses it", async () => {
    const w = world({ queue: new Error("queue down") });
    await expect(submitOperation(w.ports, plan, meta, { sign: sign(w.offered) })).rejects.toThrow("queue down");
    const [kept] = w.ports.store.read(vault.address);
    expect(kept).toMatchObject({ btcTxid: TXID, stage: "sent" });
  });

  it("records a queue that failed outright as failed", async () => {
    const w = world({ queue: "failed" });
    const op = await submitOperation(w.ports, plan, meta, { sign: sign(w.offered) });
    expect(op.stage).toBe("failed");
    expect(w.ports.store.read(vault.address)[0].stage).toBe("failed");
  });

  it("throws on a txid the service disagrees with, after recording the spend", async () => {
    const w = world({ broadcastTxid: "dd".repeat(32) });
    await expect(submitOperation(w.ports, plan, meta, { sign: sign(w.offered) })).rejects.toThrow(/returned dd+ for a transaction whose local txid is aa+/);
    expect(w.ports.store.read(vault.address)[0]).toMatchObject({ btcTxid: TXID, stage: "sent" });
    expect(w.enqueued).toEqual([]);
  });

  it("does not offer the outputs of an operation still landing as funding", async () => {
    const w = world();
    w.ports.store.write(vault.address, [{ ...meta, btcTxid: LANDING, stage: "sent", ckbTxHash: null, failure: null, at: "" }]);
    await submitOperation(w.ports, plan, meta, { sign: sign(w.offered) });
    expect(w.offered.map((u) => u.txid)).toEqual(["cc".repeat(32)]);
  });

  it("keeps the signed transaction of a ticket that creates its cell", async () => {
    const w = world();
    const op = await submitOperation(w.ports, plan, { ...meta, kind: "ticket", newCell: true }, { sign: sign(w.offered) });
    expect(op.hex).toBe("deadbeef");
  });
});
