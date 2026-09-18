/* The official launches on testnet, mined for real and published to the index.
 *
 *   node scripts/rgbpp/seed.mjs <step>
 *
 *   announce   sign the official launches and publish them to the index
 *   history    publish the live run's launch and its mint, transfer and sale
 *   advance    one pass over every launch: open, ticket, mine and mint as its
 *              cells allow, announcing each mint; `--loop` repeats until every
 *              launch has minted ROUNDS times (default 2)
 *   refresh    re-sign the official launches with their links and story
 *   market     Alice lists token cells and Bob bids, both signed, nothing spent
 *   status     where every launch stands
 *
 * Alice creates and promotes every official launch, so each ticket's 9,500
 * sats come back to the wallet that buys it: a round costs the platform fee,
 * the paymaster when a cell is new, and Bitcoin fees. Everything here goes
 * through the app's own code and the real services; the index only hears about
 * what the chain already has. INDEX sets where events go (default: the
 * deployed site).
 */

import { fileURLToPath } from "node:url";
import {
  activity, alice, bid, bob, cellsOf, cfg, close, create, events, launchCells, network, ops, provider, rgbpp, sale,
  sealedUtxos, standard, stateFile, submit, termsFrom, vaultOf, verify,
} from "./kit.mjs";

const INDEX = (process.env.INDEX ?? "https://btcfun.rjj.workers.dev").replace(/\/$/, "");
const ROUNDS = Number(process.env.ROUNDS ?? 2);

const { state, write } = stateFile(fileURLToPath(new URL("../../.e2e-runs/seed.json", import.meta.url)), {
  launches: [],
  rounds: {},
  pending: {},
  published: [],
});

/** Bitcoin culture, not anyone's brand: themes the community shares, issued by nobody in particular. */
const OFFICIAL = [
  ["PIZZA", "Pizza Day", "Ten thousand coins, two pizzas: the first thing Bitcoin ever bought.", "var(--amber)"],
  ["GENESIS", "Genesis Block", "For everyone who has read the headline in block zero.", "var(--cyan)"],
  ["HODL", "Hodl Guild", "A typo in 2013, a creed ever since. The token for the patient.", "var(--magenta)"],
  ["LASER", "Laser Eyes", "The profile-picture movement, now a token you mine.", "var(--violet)"],
  ["STACK", "Stack Sats", "Small, steady, every week. For the savers' circle.", "var(--mint)"],
  ["ORANGE", "Orange Pill", "For the friends who explained it one more time.", "var(--warn)"],
  ["NODE", "Node Runners", "For the people who validate every block themselves.", "var(--cyan)"],
  ["HALVING", "Halving Night", "Four years, half the reward, one long night.", "var(--amber)"],
  ["CYPHER", "Cypherpunks", "Privacy, open code and the mailing list that started it.", "var(--violet)"],
  ["TIMECHN", "Timechain", "Block by block, the clock nobody can stop.", "var(--mint)"],
];

/** Reference pages and a story per launch. Links point at neutral references,
 *  never at a project that has not asked to be represented. */
const EXTRAS = {
  PIZZA: ["https://en.wikipedia.org/wiki/Bitcoin_Pizza_Day", "Every community has a first purchase story; this one funds the next ones.", "Sponsor pizza nights at local meetups where newcomers pay in sats for the first time."],
  GENESIS: ["https://en.bitcoin.it/wiki/Genesis_block", "Reading the source is the best onboarding there is, and study groups need a place and a projector.", "Run a monthly reading group through the whitepaper and the genesis block, with the notes published."],
  HODL: ["https://en.wikipedia.org/wiki/Hodl", "Long-term holders are the quiet majority and rarely have a shared place.", "Keep a public, plain-language guide to self-custody and cold storage, updated every halving."],
  LASER: ["https://en.wikipedia.org/wiki/Laser_eyes", "The meme travels further than any explainer; artists who make it deserve a tip jar.", "Commission pixel art from community artists and release it under an open licence."],
  STACK: ["https://en.bitcoin.it/wiki/Satoshi_(unit)", "Saving small and often is how most people start, and they learn best together.", "Run a weekly savings challenge with a shared dashboard and small prizes paid in sats."],
  ORANGE: ["https://bitcoin.org/en/getting-started", "Explaining Bitcoin well takes time, printed material and patience.", "Print and translate a one-page beginner guide and hand it out at events."],
  NODE: ["https://bitcoin.org/en/full-node", "A node on every desk makes the network stronger; hardware is the obstacle.", "Subsidise low-power node kits for community members and publish uptime monthly."],
  HALVING: ["https://en.bitcoin.it/wiki/Controlled_supply", "The halving is the calendar the community keeps; it deserves a party.", "Host a halving-night stream and meetup with talks from local builders."],
  CYPHER: ["https://en.wikipedia.org/wiki/Cypherpunk", "Privacy tools are built by volunteers who are rarely paid for the work.", "Fund small bounties for documentation and translations of open privacy tools."],
  TIMECHN: ["https://en.bitcoin.it/wiki/Block_timestamp", "Blocks are the clock; a public screen showing them teaches more than a slide.", "Build a block-clock display for the community space and publish the design."],
};

// ─── the index ───────────────────────────────────────────────────────────

async function publish(key, draft) {
  const signed = await events.signActivity(vaultOf(key), draft);
  const res = await fetch(`${INDEX}/api/activity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signed),
  });
  if (!res.ok) throw new Error(`index refused ${draft.kind}: ${res.status} ${await res.text()}`);
  state.published.push({ kind: draft.kind, launch: draft.launch, txid: draft.txid ?? null, at: signed.body.at });
  write();
}

const launchTerms = (c) => create.termsOf(c, network.ACTIVE);

// ─── steps ───────────────────────────────────────────────────────────────

const steps = {
  async announce() {
    const tip = await provider.getTipHeight(network.ACTIVE);
    const identity = vaultOf(alice).identity;
    for (const [symbol, name, blurb, accent] of OFFICIAL) {
      if (state.launches.some((l) => l.symbol === symbol)) continue;
      const draft = {
        symbol, name, blurb, accent, promoter: alice.address, opensInBlocks: 1,
        links: Object.fromEntries(create.LINK_KINDS.map((k) => [k, ""])),
        story: { why: "", plan: "" },
      };
      const faults = create.validate(draft, network.ACTIVE);
      if (Object.keys(faults).length > 0) throw new Error(`${symbol}: ${JSON.stringify(faults)}`);
      const commitment = create.commitmentFor(draft, identity, tip, network.ACTIVE);
      await publish(alice, {
        kind: "launch",
        launch: commitment.id,
        ref: create.commitmentId(commitment),
        meta: JSON.stringify(commitment),
      });
      state.launches.push(commitment);
      write();
      console.log(`announced ${commitment.id}, opens at ${commitment.h0}`);
    }
  },

  async history() {
    const live = stateFile(fileURLToPath(new URL("../../.e2e-runs/rgbpp-live.json", import.meta.url)), null).state;
    if (!live?.launch) throw new Error("no live run to publish");
    const t = live.launch;
    const commitment = {
      v: "btcfun/launch/2",
      symbol: t.meta.symbol,
      name: t.meta.name,
      blurb: t.meta.description,
      imageHash: t.meta.imageHash,
      h0: t.terms.h0,
      promoter: bob.address,
      accent: "var(--magenta)",
      tokenId: t.tokenId,
      creator: vaultOf(bob).identity,
      at: live.steps[0]?.at ?? new Date().toISOString(),
    };
    commitment.id = create.launchIdFor(commitment.symbol, commitment.tokenId);
    if (!create.idMatches(commitment, network.ACTIVE)) throw new Error("the live launch does not reproduce its token id");
    await publish(bob, { kind: "launch", launch: commitment.id, ref: create.commitmentId(commitment), meta: JSON.stringify(commitment) });
    const done = (name) => live.steps.find((s) => s.step === name && s.queue === "completed" || s.step === name && s.ckbTxHash);
    const mint = done("mint");
    if (mint) await publish(alice, { kind: "mint", launch: commitment.id, amount: BigInt(live.mined.atoms), ref: mint.btcTxid, txid: mint.btcTxid });
    const transfer = done("transfer");
    if (transfer) await publish(alice, { kind: "transfer", launch: commitment.id, amount: BigInt(live.mined.atoms) / 4n, ref: transfer.btcTxid, txid: transfer.btcTxid });
    const buy = done("buy");
    if (buy && live.listing) {
      const offerRef = activity.payloadRef(JSON.stringify(live.listing));
      await publish(alice, { kind: "fill", launch: commitment.id, amount: BigInt(live.listing.amount), sats: live.listing.priceSats, ref: offerRef, txid: buy.btcTxid });
    }
    console.log(`published ${commitment.id} with its history`);
  },

  async advance() {
    const tip = await provider.getTipHeight(network.ACTIVE);
    const cells = await rgbpp.cells(alice.address);
    // Funding may chain on change that has not confirmed yet: the queue waits
    // for each operation's own confirmation anyway, and one coin would
    // otherwise allow one operation per block. Seals are never funding: they
    // are the 546-sat outputs, and anything that small is left alone.
    let last = null;
    const funding = async () => {
      // The next operation funds itself from the previous one's change, so wait
      // until the service lists that change rather than racing it.
      for (let i = 0; i < 20; i++) {
        const coins = (await provider.getUtxos(alice.address, network.ACTIVE)).filter((u) => u.value > 2 * ops.SEAL_SATS);
        if (!last || coins.some((u) => u.txid === last)) return coins;
        await new Promise((r) => setTimeout(r, 3_000));
      }
      return (await provider.getUtxos(alice.address, network.ACTIVE)).filter((u) => u.value > 2 * ops.SEAL_SATS);
    };

    for (const commitment of state.launches) {
      const id = commitment.id;
      const pending = state.pending[id];
      if (pending) {
        const s = await rgbpp.status(pending.btcTxid);
        if (s.state === "completed") {
          delete state.pending[id];
          if (pending.step.includes(" mint ")) state.rounds[id] = (state.rounds[id] ?? 0) + 1;
        } else if (s.state === "failed") {
          console.log(`${id}: ${pending.step} failed — ${s.failure}`);
          delete state.pending[id];
        } else {
          continue;
        }
        write();
        // The cells were read before this operation settled; acting on them
        // now would repeat it. The next pass reads them fresh.
        continue;
      }
      if ((state.rounds[id] ?? 0) >= ROUNDS) continue;
      if (tip < commitment.h0) continue;

      const terms = launchTerms(commitment);
      const { miners, tokens } = launchCells(cells, terms);
      const miner = miners[0];
      try {
        if (!miner) {
          state.pending[id] = await submit(`${id} open`, ops.planOpen(cfg, terms, await rgbpp.paymaster()), alice, await funding());
        } else if (miner.data?.state === "idle") {
          state.pending[id] = await submit(`${id} ticket`, ops.planTicket(cfg, terms, miner, tip), alice, await funding());
        } else if (miner.data?.state === "armed") {
          // Varied targets make the catalogue look like people mining, and
          // stay under a minute of CPU each.
          const target = 17 + Math.floor(Math.random() * 5);
          const challenge = standard.ticketChallenge(miner.seal.txid, miner.seal.vout);
          let best = { clz: -1 };
          for (let nonce = 0n; best.clz < target; nonce++) {
            const found = verify.recompute(challenge, nonce);
            if (found.clz > best.clz) best = found;
          }
          const atoms = standard.reward(best.clz, terms.h0, miner.data.anchor);
          const plan = ops.planMint(cfg, terms, {
            miner,
            held: tokens[0] ?? null,
            nonce: BigInt(best.nonce),
            reward: atoms,
            paymaster: tokens[0] ? null : await rgbpp.paymaster(),
          });
          const step = await submit(`${id} mint ${best.clz} bits`, plan, alice, await funding());
          state.pending[id] = step;
          await publish(alice, { kind: "mint", launch: id, amount: atoms, ref: step.btcTxid, txid: step.btcTxid });
        }
        last = state.pending[id]?.btcTxid ?? last;
        write();
      } catch (err) {
        console.log(`${id}: ${err.message}`);
        if (/confirmed balance|InsufficientFunds/i.test(err.message)) break;
      }
    }
    write();
  },

  async refresh() {
    for (const commitment of state.launches) {
      const extra = EXTRAS[commitment.symbol];
      if (!extra) continue;
      const [website, why, plan] = extra;
      const links = Object.fromEntries(create.LINK_KINDS.map((k) => [k, k === "website" ? website : ""]));
      const story = { why, plan };
      const updated = { ...commitment, ...create.extrasOf({ links, story }), at: new Date().toISOString() };
      if (!create.idMatches(updated, network.ACTIVE)) throw new Error(`${commitment.id}: links changed the id`);
      await publish(alice, { kind: "launch", launch: updated.id, ref: create.commitmentId(updated), meta: JSON.stringify(updated) });
      Object.assign(commitment, updated);
      write();
      console.log(`${commitment.id}: links and story published`);
    }
  },

  async market() {
    const prices = [18_000, 24_000, 31_000, 45_000];
    let listed = 0;
    for (const commitment of state.launches) {
      const terms = launchTerms(commitment);
      const { tokens } = await cellsOf(alice.address, terms);
      const cell = tokens[0];
      if (!cell || listed >= prices.length) continue;
      const [utxo] = await sealedUtxos(alice.address, [cell.seal]);
      const listing = sale.signListing(alice, { launchId: commitment.id, tokenId: commitment.tokenId }, cell, utxo.value, prices[listed]);
      const meta = JSON.stringify(listing);
      await publish(alice, { kind: "offer", launch: commitment.id, amount: cell.amount, sats: listing.priceSats, ref: activity.payloadRef(meta), meta });
      console.log(`${commitment.id}: listed ${cell.amount} atoms for ${listing.priceSats} sats`);
      listed++;
    }
    for (const [i, commitment] of state.launches.entries()) {
      if (i % 2 === 1) continue;
      const amount = BigInt(100 + i * 25) * standard.UNIT;
      const b = bid.composeBid({ launchId: commitment.id, tokenId: commitment.tokenId, amount, priceSats: 6_000 + i * 1_500 }, bob.address);
      await publish(bob, bid.bidDraft(b));
      console.log(`${commitment.id}: bid ${amount} atoms for ${b.priceSats} sats`);
    }
  },

  async status() {
    const tip = await provider.getTipHeight(network.ACTIVE);
    const cells = await rgbpp.cells(alice.address);
    for (const c of state.launches) {
      const { miners, tokens } = launchCells(cells, launchTerms(c));
      const balance = tokens.reduce((n, t) => n + t.amount, 0n);
      console.log(
        `${c.id.padEnd(24)} opens ${c.h0}${tip < c.h0 ? " (not yet)" : ""}  miner ${miners[0]?.data?.state ?? "none"}  ` +
          `rounds ${state.rounds[c.id] ?? 0}/${ROUNDS}  balance ${balance}  ${state.pending[c.id] ? `pending ${state.pending[c.id].step}` : ""}`,
      );
    }
    const free = (await rgbpp.freeUtxos(alice.address)).filter((u) => u.confirmed).reduce((n, u) => n + u.value, 0);
    console.log(`tip ${tip}; Alice has ${free} confirmed sats free`);
  },
};

const [name, flag] = process.argv.slice(2);
if (!steps[name]) {
  console.log(`steps: ${Object.keys(steps).join(", ")}`);
} else {
  try {
    if (name === "advance" && flag === "--loop") {
      for (;;) {
        await steps.advance();
        if (state.launches.every((c) => (state.rounds[c.id] ?? 0) >= ROUNDS)) break;
        await new Promise((r) => setTimeout(r, 90_000));
      }
    } else {
      await steps[name]();
    }
  } finally {
    await close();
  }
}
