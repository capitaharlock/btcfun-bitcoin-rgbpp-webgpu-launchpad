/* A token's whole life on testnet, step by step, with the app's own code.
 *
 *   node scripts/rgbpp/live.mjs <step>
 *
 *   launch     fix the launch terms (opening now, tickets paid to Bob)
 *   open       open Alice's miner cell through the paymaster
 *   ticket     buy a ticket: the miner cell arms, anchored at the tip
 *   mine       grind the armed ticket until the hash mints something
 *   mint       mint the result into Alice's token cell
 *   transfer   send part of Alice's balance to Bob
 *   list       Bob signs a listing of his token cell (PRICE sats, default 20,000)
 *   buy        Alice completes Bob's listing alone and broadcasts it
 *   status     show the queue and every cell of this launch, for both wallets
 *
 * Every Bitcoin transaction is built by `lib/rgbpp` exactly as the browser
 * builds it; the only thing this file adds is a key read from disk. Each step
 * records what it did in `.e2e-runs/rgbpp-live.json`, so the steps can be run
 * minutes apart while Bitcoin confirms and the RGB++ queue completes the CKB
 * side. Testnet only: the RGB++ configuration here is CKB testnet's.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sha256 } from "@noble/hashes/sha2";
import { mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { close, loadAll } from "../e2e/load.mjs";

const STATE = fileURLToPath(new URL("../../.e2e-runs/rgbpp-live.json", import.meta.url));
const WALLET = fileURLToPath(new URL("../../.e2e-wallet.json", import.meta.url));

const [network, keys, provider, standard, config, launch, ops, bitcoin, service, verify, seal, sale] = await loadAll(
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
);

if (network.ACTIVE.id === "mainnet") throw new Error("the live RGB++ run is testnet-only");
const cfg = config.ACTIVE_RGBPP;
const rgbpp = new service.RgbppService(cfg, { origin: "https://btcfun.localhost" });

// ─── keys ────────────────────────────────────────────────────────────────

const mnemonic = process.env.E2E_MNEMONIC?.trim() || JSON.parse(readFileSync(WALLET, "utf8")).mnemonic;
const aliceEntropy = mnemonicToEntropy(mnemonic, wordlist);
/** Bob: a second wallet derived from Alice's secret, so the run needs one secret. */
const bobEntropy = sha256(new Uint8Array([...aliceEntropy, ...new TextEncoder().encode("btcfun/bob")]));
const alice = keys.deriveKey(aliceEntropy, network.ACTIVE);
const bob = keys.deriveKey(bobEntropy, network.ACTIVE);

// ─── state ───────────────────────────────────────────────────────────────

const read = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { steps: [] });
function write(state) {
  mkdirSync(fileURLToPath(new URL(".", `file://${STATE}`)), { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
}
const state = read();

function termsOf(state) {
  if (!state.launch) throw new Error("run `launch` first");
  const t = state.launch.terms;
  return {
    h0: t.h0,
    metadataHash: Uint8Array.from(Buffer.from(t.metadataHash, "hex")),
    promoterScript: Uint8Array.from(Buffer.from(t.promoterScript, "hex")),
  };
}

// ─── reading the chain ───────────────────────────────────────────────────

/** This launch's miner and token cells sealed to `address`. */
async function cellsOf(address, terms) {
  const mint = launch.mintScript(cfg, terms);
  const token = launch.tokenScript(cfg, mint);
  const cells = await rgbpp.cells(address);
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

/** The UTXOs behind `seals`, with their values, from the address's unspent set. */
async function sealedUtxos(address, seals) {
  const utxos = await provider.getUtxos(address, network.ACTIVE);
  return seals.map((s) => {
    const found = utxos.find((u) => u.txid === s.txid && u.vout === s.vout);
    if (!found) throw new Error(`sealed UTXO ${s.txid}:${s.vout} is not unspent yet`);
    return found;
  });
}

async function submit(name, plan, key) {
  const [sealed, free, feeRate] = await Promise.all([
    sealedUtxos(key.address, plan.sealsSpent),
    rgbpp.freeUtxos(key.address),
    provider.getFeeRate(network.ACTIVE),
  ]);
  const signed = bitcoin.signOperation(key, plan, sealed, free.filter((u) => u.confirmed), Math.max(feeRate, 1));
  const txid = await rgbpp.broadcast(signed.hex);
  const queue = await rgbpp.enqueue(plan, txid);
  const step = { step: name, btcTxid: txid, fee: signed.fee, vsize: signed.vsize, queue, at: new Date().toISOString() };
  state.steps.push(step);
  write(state);
  console.log(`${name}: ${network.txUrl(txid, network.ACTIVE)} (queue: ${queue})`);
  return step;
}

// ─── steps ───────────────────────────────────────────────────────────────

const steps = {
  async launch() {
    const tip = await provider.getTipHeight(network.ACTIVE);
    const meta = { name: "Live QA", symbol: "LIVEQA", description: "The btc.fun live testnet run.", imageHash: "" };
    const terms = {
      h0: tip,
      metadataHash: launch.metadataHash(meta),
      promoterScript: launch.promoterScriptFor(bob.address, network.ACTIVE),
    };
    state.launch = {
      meta,
      terms: {
        h0: terms.h0,
        metadataHash: Buffer.from(terms.metadataHash).toString("hex"),
        promoterScript: Buffer.from(terms.promoterScript).toString("hex"),
      },
      tokenId: launch.tokenId(cfg, terms),
      mintScript: launch.mintScript(cfg, terms).hash(),
      alice: alice.address,
      bob: bob.address,
    };
    write(state);
    console.log(state.launch);
  },

  async open() {
    const terms = termsOf(state);
    const plan = ops.planOpen(cfg, terms, await rgbpp.paymaster());
    await submit("open", plan, alice);
  },

  async ticket() {
    const terms = termsOf(state);
    const { miners } = await cellsOf(alice.address, terms);
    const idle = miners.find((m) => m.data?.state === "idle");
    if (!idle) throw new Error("no idle miner cell yet: run `open` and wait for the queue");
    const tip = await provider.getTipHeight(network.ACTIVE);
    await submit("ticket", ops.planTicket(cfg, terms, idle, tip), alice);
  },

  async mine() {
    const terms = termsOf(state);
    const { miners } = await cellsOf(alice.address, terms);
    const armed = miners.find((m) => m.data?.state === "armed");
    if (!armed) throw new Error("no armed miner cell yet: run `ticket` and wait for the queue");
    const target = Number(process.env.TARGET_CLZ ?? 20);
    const challenge = standard.ticketChallenge(armed.seal.txid, armed.seal.vout);
    const started = Date.now();
    let best = { clz: -1 };
    for (let nonce = 0n; best.clz < target; nonce++) {
      const found = verify.recompute(challenge, nonce);
      if (found.clz > best.clz) best = found;
    }
    const atoms = standard.reward(best.clz, terms.h0, armed.data.anchor);
    state.mined = { seal: armed.seal, nonce: best.nonce, clz: best.clz, hash: best.hash, atoms, seconds: (Date.now() - started) / 1000 };
    write(state);
    console.log(state.mined);
  },

  async mint() {
    const terms = termsOf(state);
    if (!state.mined) throw new Error("run `mine` first");
    const { miners, tokens } = await cellsOf(alice.address, terms);
    const armed = miners.find((m) => m.data?.state === "armed");
    if (!armed || armed.seal.txid !== state.mined.seal.txid) throw new Error("the mined ticket is not the armed cell");
    const plan = ops.planMint(cfg, terms, {
      miner: armed,
      held: tokens[0] ?? null,
      nonce: BigInt(state.mined.nonce),
      reward: BigInt(state.mined.atoms),
      paymaster: tokens[0] ? null : await rgbpp.paymaster(),
    });
    await submit("mint", plan, alice);
  },

  async transfer() {
    const terms = termsOf(state);
    const { tokens } = await cellsOf(alice.address, terms);
    if (tokens.length === 0) throw new Error("Alice holds none of this token yet");
    const amount = BigInt(process.env.AMOUNT ?? tokens[0].amount / 4n);
    const plan = ops.planTransfer(cfg, terms, { from: tokens, amount, to: bob.address, paymaster: await rgbpp.paymaster() });
    await submit("transfer", plan, alice);
  },

  // The seller only signs; nothing is broadcast and no satoshi leaves Bob.
  async list() {
    const terms = termsOf(state);
    const { tokens } = await cellsOf(bob.address, terms);
    if (tokens.length === 0) throw new Error("Bob holds none of this token yet: run `transfer` and wait for the queue");
    const cell = tokens[0];
    const [utxo] = await sealedUtxos(bob.address, [cell.seal]);
    const priceSats = Number(process.env.PRICE ?? 20_000);
    state.listing = sale.signListing(bob, { launchId: "live", tokenId: state.launch.tokenId }, cell, utxo.value, priceSats);
    write(state);
    console.log(`listed ${cell.amount} atoms for ${priceSats} sats: ${cell.seal.txid}:${cell.seal.vout}`);
  },

  // The buyer finishes the seller's half with its own inputs; Bob is not asked
  // for anything.
  async buy() {
    if (!state.listing) throw new Error("run `list` first");
    const listing = state.listing;
    const terms = termsOf(state);
    const { tokens } = await cellsOf(bob.address, terms);
    const cell = tokens.find((c) => c.outPoint.txHash === listing.outPoint.txHash && c.outPoint.index === listing.outPoint.index);
    if (!cell) throw new Error("the listed cell is no longer live");
    const plan = sale.planPurchase(cfg, terms, cell);
    const [free, feeRate] = await Promise.all([rgbpp.freeUtxos(alice.address), provider.getFeeRate(network.ACTIVE)]);
    const signed = sale.completePurchase(alice, listing, plan, free.filter((u) => u.confirmed), Math.max(feeRate, 1));
    const txid = await rgbpp.broadcast(signed.hex);
    const queue = await rgbpp.enqueue(plan, txid);
    state.steps.push({ step: "buy", btcTxid: txid, fee: signed.fee, vsize: signed.vsize, queue, at: new Date().toISOString() });
    write(state);
    console.log(`buy: ${network.txUrl(txid, network.ACTIVE)} (queue: ${queue})`);
  },

  async status() {
    for (const step of state.steps) {
      const s = await rgbpp.status(step.btcTxid);
      step.ckbTxHash = s.ckbTxHash;
      console.log(`${step.step.padEnd(9)} btc ${step.btcTxid.slice(0, 12)}…  queue ${s.state}${s.ckbTxHash ? `  ckb ${s.ckbTxHash}` : ""}${s.failure ? `  ! ${s.failure}` : ""}`);
    }
    write(state);
    if (state.launch) {
      const terms = termsOf(state);
      for (const [who, key] of [["alice", alice], ["bob", bob]]) {
        const { miners, tokens } = await cellsOf(key.address, terms);
        console.log(`${who} ${key.address}: miner cells ${miners.map((m) => m.data?.state).join(",") || "none"}; ` +
          `balance ${tokens.reduce((n, t) => n + t.amount, 0n)} atoms in ${tokens.length} cell(s)`);
      }
    }
  },
};

const name = process.argv[2];
if (!steps[name]) {
  console.log(`steps: ${Object.keys(steps).join(", ")}`);
} else {
  try {
    await steps[name]();
  } finally {
    await close();
  }
}
