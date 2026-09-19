/* What every testnet script over RGB++ shares: the app's modules, the two
 * wallets, reading cells from the chain and submitting an operation.
 *
 * The runners (`live.mjs`, `seed.mjs`) differ in what they do, not in how a
 * transaction is built: that is the app's `lib/rgbpp`, loaded here through
 * Vite exactly as the browser loads it. Testnet only.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "@noble/hashes/sha2";
import { mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { close, loadAll } from "../e2e/load.mjs";

const WALLET = fileURLToPath(new URL("../../.e2e-wallet.json", import.meta.url));

export const [network, keys, provider, standard, config, launch, ops, bitcoin, service, verify, seal, sale, create, events, bid, activity, image, payment] =
  await loadAll(
    "lib/bitcoin/network.ts",
    "lib/bitcoin/keys.ts",
    "lib/bitcoin/provider.ts",
    "lib/standard.ts",
    "lib/rgbpp/config.ts",
    "lib/rgbpp/launch.ts",
    "lib/rgbpp/operations.ts",
    "lib/rgbpp/bitcoin.ts",
    "lib/rgbpp/service.ts",
    "lib/mining/verify.ts",
    "lib/rgbpp/seal.ts",
    "lib/rgbpp/sale.ts",
    "lib/launches/create.ts",
    "lib/activity/events.ts",
    "lib/market/bid.ts",
    "lib/activity/verify.ts",
    "lib/launches/image.ts",
    "lib/bitcoin/payment.ts",
  );
export { close };

if (network.ACTIVE.id === "mainnet") throw new Error("the RGB++ scripts are testnet-only");
export const cfg = config.ACTIVE_RGBPP;
export const rgbpp = new service.RgbppService(cfg, { origin: "https://btcfun.localhost" });

// ─── keys ────────────────────────────────────────────────────────────────

const mnemonic = process.env.E2E_MNEMONIC?.trim() || JSON.parse(readFileSync(WALLET, "utf8")).mnemonic;
const aliceEntropy = mnemonicToEntropy(mnemonic, wordlist);
/** Bob: a second wallet derived from Alice's secret, so the scripts need one secret. */
const bobEntropy = sha256(new Uint8Array([...aliceEntropy, ...new TextEncoder().encode("btcfun/bob")]));
export const alice = keys.deriveKey(aliceEntropy, network.ACTIVE);
export const bob = keys.deriveKey(bobEntropy, network.ACTIVE);
/** The shared demo wallet the site offers (its secret is public on purpose, testnet only). */
const demoEntropy = sha256(new Uint8Array([...aliceEntropy, ...new TextEncoder().encode("btcfun/demo")]));
export const demo = keys.deriveKey(demoEntropy, network.ACTIVE);

/** A key as the activity signer expects a wallet: identity plus a scoped use. */
export const vaultOf = (key) => ({
  kind: "script",
  address: key.address,
  identity: keys.identityOf(key),
  label: "script key",
  use: async (fn) => fn(key),
});

// ─── state ───────────────────────────────────────────────────────────────

/** A JSON state file that survives between steps run minutes apart. */
export function stateFile(path, initial) {
  const state = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : initial;
  const write = () => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
  };
  return { state, write };
}

export function termsFrom(saved) {
  return {
    h0: saved.h0,
    metadataHash: Uint8Array.from(Buffer.from(saved.metadataHash, "hex")),
    promoterScript: Uint8Array.from(Buffer.from(saved.promoterScript, "hex")),
  };
}

export function savedTerms(terms) {
  return {
    h0: terms.h0,
    metadataHash: Buffer.from(terms.metadataHash).toString("hex"),
    promoterScript: Buffer.from(terms.promoterScript).toString("hex"),
  };
}

// ─── reading the chain ───────────────────────────────────────────────────

/** A launch's miner and token cells among `cells` (an address's RGB++ cells). */
export function launchCells(cells, terms) {
  const mint = launch.mintScript(cfg, terms);
  const token = launch.tokenScript(cfg, mint);
  const sealed = (c) => ({
    outPoint: { txHash: c.outPoint.txHash, index: Number(c.outPoint.index) },
    capacity: BigInt(c.cellOutput.capacity),
    seal: seal.sealFromArgs(c.cellOutput.lock.args),
  });
  const typeHash = (c) => c.typeHash ?? null;
  return {
    miners: cells
      .filter((c) => typeHash(c) === mint.hash())
      .map((c) => ({ ...sealed(c), data: ops.decodeMinerCell(c.data) })),
    tokens: cells.filter((c) => typeHash(c) === token.hash()).map((c) => ({ ...sealed(c), amount: ops.decodeAmount(c.data) })),
  };
}

export async function cellsOf(address, terms) {
  return launchCells(await rgbpp.cells(address), terms);
}

/** The UTXOs behind `seals`, with their values, from `utxos` or the address's unspent set. */
export async function sealedUtxos(address, seals, utxos) {
  const set = utxos ?? (await provider.getUtxos(address, network.ACTIVE));
  return seals.map((s) => {
    const found = set.find((u) => u.txid === s.txid && u.vout === s.vout);
    if (!found) throw new Error(`sealed UTXO ${s.txid}:${s.vout} is not unspent yet`);
    return found;
  });
}

/**
 * Sign, broadcast and enqueue `plan` for `key`, funded from `free` when given.
 * Returns the step record. Inputs the transaction spent are removed from
 * `free`, so a caller submitting several operations in one block never funds
 * two of them with the same coin.
 */
export async function submit(name, plan, key, free) {
  const [sealed, pool, feeRate] = await Promise.all([
    sealedUtxos(key.address, plan.sealsSpent),
    free ? Promise.resolve(free) : rgbpp.freeUtxos(key.address).then((u) => u.filter((x) => x.confirmed)),
    provider.getFeeRate(network.ACTIVE),
  ]);
  const signed = bitcoin.signOperation(key, plan, sealed, pool, Math.max(feeRate, 1));
  const txid = await rgbpp.broadcast(signed.hex);
  const queue = await rgbpp.enqueue(plan, txid);
  if (free) {
    for (const spent of signed.funding) {
      const i = free.findIndex((u) => u.txid === spent.txid && u.vout === spent.vout);
      if (i >= 0) free.splice(i, 1);
    }
  }
  console.log(`${name}: ${network.txUrl(txid, network.ACTIVE)} (queue: ${queue})`);
  return { step: name, btcTxid: txid, fee: signed.fee, vsize: signed.vsize, queue, at: new Date().toISOString() };
}
