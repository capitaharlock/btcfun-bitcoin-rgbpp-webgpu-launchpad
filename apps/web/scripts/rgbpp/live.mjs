/* A token's whole life on testnet, step by step, with the app's own code.
 *
 *   node scripts/rgbpp/live.mjs <step>
 *
 *   launch     register a launch as the create page does — pay the
 *              registration, get the site's certificate, announce it — opening
 *              at the next block, tickets paid to Bob
 *   ticket     buy a ticket: it creates the miner cell, paid, or re-arms an
 *              idle one at the tip
 *   arm        arm a paid cell, once its ticket has settled (network fee only)
 *   mine       grind the armed ticket until the hash mints something
 *   mint       mint the result into the miner's token cell (network fee only)
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
 *
 * MINER=demo mines with the shared demo wallet instead of Alice.
 */

import { fileURLToPath } from "node:url";
import {
  alice as aliceKey, bob, cellsOf, cfg, close, create, creatingTx, demo, events, INDEX, launch, network, ops, provider, register, rgbpp, sale,
  sealedUtxos, certificate, savedTerms, standard, stateFile, submit as send, termsFrom, vaultOf, verify,
} from "./kit.mjs";

/** Who mines: Alice, or the shared demo wallet. */
const alice = process.env.MINER === "demo" ? demo : aliceKey;

const { state, write } = stateFile(fileURLToPath(new URL("../../.e2e-runs/rgbpp-live.json", import.meta.url)), { steps: [] });

function termsOf(state) {
  if (!state.launch) throw new Error("run `launch` first");
  return termsFrom(state.launch.terms);
}

async function submit(name, plan, key) {
  const step = await send(name, plan, key);
  state.steps.push(step);
  write();
  return step;
}

// ─── steps ───────────────────────────────────────────────────────────────

const steps = {
  async launch() {
    const tip = await provider.getTipHeight(network.ACTIVE);
    const symbol = process.env.SYMBOL ?? "LIVEQA";
    const draft = {
      symbol, name: "Live QA", blurb: "The btc.fun live testnet run, registered like anyone's launch.", accent: "var(--cyan)",
      promoter: bob.address, opensInBlocks: 1,
      links: Object.fromEntries(create.LINK_KINDS.map((k) => [k, ""])), story: { why: "", plan: "" }, image: "",
    };
    // A registration already paid for this draft is resumed, never paid twice.
    const paid = state.registration?.symbol === symbol ? state.registration : null;
    const h0 = paid?.h0 ?? tip + draft.opensInBlocks;
    const { registration, certificate: cert } = await register(alice, draft, h0, paid);
    state.registration = { ...registration, symbol };
    write();
    const commitment = create.commitmentFor(draft, vaultOf(alice).identity, registration, cert, network.ACTIVE);
    if (!create.idMatches(commitment, network.ACTIVE)) throw new Error("the certificate does not verify");
    const signed = await events.signActivity(vaultOf(alice), { kind: "launch", launch: commitment.id, ref: create.commitmentId(commitment), meta: JSON.stringify(commitment) });
    const res = await fetch(`${INDEX}/api/activity`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signed) });
    if (!res.ok) throw new Error(`index refused the launch: ${res.status} ${await res.text()}`);
    const terms = create.termsOf(commitment, network.ACTIVE);
    state.launch = {
      id: commitment.id,
      meta: { name: draft.name, symbol, description: draft.blurb, imageHash: "" },
      terms: savedTerms(terms),
      registration: registration.txid,
      certificate: cert,
      tokenId: launch.tokenId(cfg, terms),
      mintScript: launch.mintScript(cfg, terms).hash(),
      alice: alice.address,
      bob: bob.address,
    };
    state.steps.push({ step: "launch", btcTxid: registration.txid, at: new Date().toISOString() });
    write();
    console.log(`${INDEX}/#/launch/${commitment.id}`, state.launch);
  },

  async ticket() {
    const terms = termsOf(state);
    const { miners } = await cellsOf(alice.address, terms);
    if (miners.some((m) => m.data?.state !== "idle")) throw new Error("this miner already holds a ticket: arm, mine or mint it");
    const idle = miners.find((m) => m.data?.state === "idle") ?? null;
    const tip = await provider.getTipHeight(network.ACTIVE);
    const plan = ops.planTicket(cfg, terms, { idle, paymaster: idle ? null : await rgbpp.paymaster(), tip });
    await submit(idle ? "ticket (re-arm)" : "ticket (new cell)", plan, alice);
  },

  async arm() {
    const terms = termsOf(state);
    const { miners } = await cellsOf(alice.address, terms);
    const paid = miners.find((m) => m.data?.state === "paid");
    if (!paid) throw new Error("no paid miner cell yet: run `ticket` and wait for the queue");
    const tip = await provider.getTipHeight(network.ACTIVE);
    await submit("arm", ops.planArm(cfg, terms, paid, await creatingTx(paid.seal.txid), tip, certificate.admissionBytes(state.launch.registration, state.launch.certificate)), alice);
  },

  async mine() {
    const terms = termsOf(state);
    const { miners } = await cellsOf(alice.address, terms);
    const armed = miners.find((m) => m.data?.state === "armed");
    if (!armed) throw new Error("no armed miner cell yet: run `ticket` (and `arm`) and wait for the queue");
    const target = Number(process.env.TARGET_CLZ ?? 20);
    const { txid: ctxid, vout: cvout } = ops.challengeOutpoint(armed);
    const challenge = standard.ticketChallenge(ctxid, cvout);
    const started = Date.now();
    let best = { clz: -1 };
    for (let nonce = 0n; best.clz < target; nonce++) {
      const found = verify.recompute(challenge, nonce);
      if (found.clz > best.clz) best = found;
    }
    const atoms = standard.reward(best.clz, terms.h0, armed.data.anchor);
    state.mined = { seal: armed.seal, nonce: best.nonce, clz: best.clz, hash: best.hash, atoms, seconds: (Date.now() - started) / 1000 };
    write();
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
    write();
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
    write();
    console.log(`buy: ${network.txUrl(txid, network.ACTIVE)} (queue: ${queue})`);
  },

  async status() {
    for (const step of state.steps) {
      const s = await rgbpp.status(step.btcTxid);
      step.ckbTxHash = s.ckbTxHash;
      console.log(`${step.step.padEnd(9)} btc ${step.btcTxid.slice(0, 12)}…  queue ${s.state}${s.ckbTxHash ? `  ckb ${s.ckbTxHash}` : ""}${s.failure ? `  ! ${s.failure}` : ""}`);
    }
    write();
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
