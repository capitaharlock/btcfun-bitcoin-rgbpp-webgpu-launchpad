/* What every testnet script over RGB++ shares: the app's modules, the two
 * wallets, reading cells from the chain and submitting an operation.
 *
 * The runners (`live.mjs`, `seed.mjs`) differ in what they do, not in how a
 * transaction is built: that is the app's `lib/rgbpp`, loaded here through
 * Vite exactly as the browser loads it. Testnet only.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { sha256 } from "@noble/hashes/sha2";
import { mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { close, loadAll } from "../e2e/load.mjs";
import { requireMnemonic, runFile } from "../local.mjs";

export const [network, keys, provider, standard, config, launch, ops, bitcoin, service, verify, seal, sale, create, events, bid, activity, image, payment, certificate, launches, registration, certifier, storage] =
  await loadAll(
    "domain/bitcoin/network.ts",
    "domain/bitcoin/keys.ts",
    "adapters/mempool/provider.ts",
    "domain/protocol/standard.ts",
    "domain/rgbpp/config.ts",
    "domain/rgbpp/launch.ts",
    "domain/rgbpp/index.ts",
    "domain/rgbpp/transaction.ts",
    "adapters/rgbpp/service.ts",
    "domain/mining/verify.ts",
    "domain/rgbpp/seal.ts",
    "domain/rgbpp/sale/index.ts",
    "app/launches/create.ts",
    "domain/activity/events.ts",
    "domain/market/bid.ts",
    "domain/activity/verify.ts",
    "domain/launches/image.ts",
    "domain/bitcoin/index.ts",
    "domain/launches/certificate.ts",
    "domain/launches/index.ts",
    "app/launches/registration.ts",
    "adapters/activity-index/certifier.ts",
    "adapters/storage/memory.ts",
  );
export { close };

if (network.ACTIVE.id === "mainnet") throw new Error("the RGB++ scripts are testnet-only");
export const cfg = config.ACTIVE_RGBPP;
export const rgbpp = new service.RgbppService(cfg, { origin: "https://btcfun.localhost" });
/** What the app keeps on the device, kept in memory for the length of a run: the runners keep their own state files. */
export const store = storage.memoryStore();

// ─── keys ────────────────────────────────────────────────────────────────

const aliceEntropy = mnemonicToEntropy(requireMnemonic(), wordlist);
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

/** A runner's JSON state (`local.mjs` `runFile`), kept between steps run minutes apart. */
export function stateFile(name, initial) {
  const path = runFile(name);
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

// ─── registering a launch ────────────────────────────────────────────────

/** The deployed site: its index takes announcements and its signer certifies registrations. */
export const INDEX = (process.env.INDEX ?? "https://btcfun.rjj.workers.dev").replace(/\/$/, "");

/**
 * Register a draft opening at `h0` exactly as the create page does, with no
 * exception for the platform's own launches: `key` pays REGISTRATION_SATS to
 * the platform with the commitment to the terms, and the site's public signer
 * (`POST /api/certify`) certifies it once Bitcoin has seen the payment. Resumes
 * from `paid` (a registration sent earlier) so a retry never pays twice.
 */
export async function register(key, draft, h0, paid = null) {
  let payment = paid;
  if (!payment) {
    const [free, feeRate] = await Promise.all([rgbpp.freeUtxos(key.address), provider.fastFeeRate(network.ACTIVE)]);
    // Unconfirmed change is spendable: the signer needs the payment seen, not confirmed.
    const plain = bitcoin.plainFunding(free, new Set());
    payment = await registration.payRegistration({ vault: vaultOf(key), store, broadcast: (hex) => rgbpp.broadcast(hex) }, draft, h0, plain, feeRate);
    console.log(`registration ${draft.symbol}: ${network.txUrl(payment.txid, network.ACTIVE)}`);
  }
  return { registration: payment, certificate: await registration.certify(certifier.httpCertifier(INDEX), draft, payment) };
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

/** The ticket that created a paid miner cell, stripped as its arming carries it. */
export async function creatingTx(txid) {
  return bitcoin.strippedTx(await provider.getTxHex(txid, network.ACTIVE));
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
    provider.fastFeeRate(network.ACTIVE),
  ]);
  const signed = bitcoin.signOperation(key, plan, sealed, pool, feeRate);
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
