/* The end-to-end run: one token's whole life, on testnet4, with real money.
 *
 * This is the test the unit suite cannot be. Everything here touches the
 * network: a real payment is broadcast to a real node, the challenge is
 * derived from the txid that node assigned, the work is really ground, and the
 * claim is validated by the same `replay` the browser runs. If any step is
 * wrong the run fails with the chain's own error, not an assertion about a
 * mock.
 *
 *   1  create a launch          — signed commitment, identity from its terms
 *   2  buy a ticket             — real P2WPKH payment to the launch's burn
 *                                 address, carrying an OP_RETURN commitment
 *   3  mine                     — real proof of work against the real txid
 *   4  claim                    — signed record, validated by replay
 *   5  transfer                 — to a second identity, validated by replay
 *   6  list an offer            — signed, priced, bound to the launch
 *   7  announce                 — publish every step to the index, if running
 *   8  re-verify                — replay the whole chain from genesis
 *
 * Usage:  node scripts/e2e/run.mjs [--min-clz 20] [--ticket-sats 2000]
 *                                  [--fee-rate 1] [--keep] [--dry-run]
 *
 * Costs per run: the ticket, plus the fee for one transaction. Nothing is
 * recoverable — the reserve address is provably unspendable by design.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";

import { load, loadAll, close } from "./load.mjs";
import { assertTestnet, testVault, balanceOf, WalletMissing } from "./wallet.mjs";
import { createFileLedger } from "./ledger.mjs";

// ── arguments ────────────────────────────────────────────────────────────────

const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const MIN_CLZ = Number(arg("min-clz", 20));
const TICKET_SATS = Number(arg("ticket-sats", 2000));
const FEE_RATE = Number(arg("fee-rate", 1));
const DRY_RUN = flag("dry-run");
const KEEP = flag("keep");

const OUT_DIR = fileURLToPath(new URL("../../.e2e-runs/", import.meta.url));

// ── output ───────────────────────────────────────────────────────────────────

const steps = [];
let stepNo = 0;

function step(name) {
  stepNo += 1;
  process.stdout.write(`${String(stepNo).padStart(2)}  ${name.padEnd(34)}`);
  const started = Date.now();
  return {
    ok(detail) {
      const ms = Date.now() - started;
      console.log(`ok   ${detail}${ms > 1500 ? `  (${(ms / 1000).toFixed(1)}s)` : ""}`);
      steps.push({ step: stepNo, name, ok: true, detail, ms });
    },
    skip(why) {
      console.log(`--   ${why}`);
      steps.push({ step: stepNo, name, ok: true, skipped: true, detail: why });
    },
  };
}

function fail(name, err) {
  console.error(`\nFAILED at "${name}": ${err?.message ?? err}`);
  if (err?.stack && process.env.DEBUG) console.error(err.stack);
  steps.push({ step: stepNo, name, ok: false, detail: String(err?.message ?? err) });
  writeReport();
  return 1;
}

function writeReport() {
  if (!KEEP && !steps.some((s) => s.ok === false)) return;
  mkdirSync(OUT_DIR, { recursive: true });
  const path = `${OUT_DIR}run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(path, `${JSON.stringify({ steps, argv: argv.slice(2) }, null, 2)}\n`);
  console.log(`\nreport: ${path}`);
}

// ── the run ──────────────────────────────────────────────────────────────────

async function main() {
  const network = await assertTestnet();
  console.log(`\nbtc.fun end-to-end — ${network.label}\n`);

  const [keys, provider, paymentMod, reserveMod, challengeMod, miningMod] = await loadAll(
    "lib/bitcoin/keys.ts",
    "lib/bitcoin/provider.ts",
    "lib/bitcoin/payment.ts",
    "lib/bitcoin/reserve.ts",
    "lib/challenge.ts",
    "lib/mining/verify.ts",
  );
  const [ledgerRules, ledgerAuthor, ledgerDecode, creation, market, activity, emission, launchData] =
    await loadAll(
      "lib/ledger/rules.ts",
      "lib/ledger/author.ts",
      "lib/ledger/decode.ts",
      "lib/launches/create.ts",
      "lib/market/offers.ts",
      "lib/activity/index.ts",
      "lib/emission.ts",
      "data/launches.ts",
    );

  // 1 ── wallet and funds
  let vault;
  let s = step("wallet");
  {
    vault = await testVault();
    const { total, pending, utxos } = await balanceOf(vault.address);
    const confirmed = total - pending;
    s.ok(`${vault.address}  ${confirmed} sat confirmed, ${utxos.length} utxo`);

    const needed = TICKET_SATS + 400;
    if (confirmed < needed && !DRY_RUN) {
      console.log(
        `\nNot enough confirmed balance: need about ${needed} sat, have ${confirmed}.\n` +
          `Fund ${vault.address} and run again.\n` +
          network.faucets.map((f) => `  ${f.name}  ${f.url}`).join("\n"),
      );
      return 2;
    }
  }

  // 2 ── a launch, created the way the wizard creates one
  const tip = await provider.getTipHeight();
  let commitment;
  let rules;
  s = step("create a launch");
  {
    const symbol = `E2E${String(tip % 100000).padStart(5, "0")}`;
    const draft = {
      symbol,
      name: "End-to-end run",
      blurb: "A launch created by the end-to-end runner against live testnet4.",
      opensInBlocks: 1,
      epochBlocks: 6,
      halfLife: 1008,
      decimals: 8,
      ticketSats: TICKET_SATS,
      minClz: MIN_CLZ,
      accent: "var(--amber)",
    };
    const faults = creation.validate(draft);
    if (Object.keys(faults).length > 0) {
      throw new Error(`draft rejected: ${JSON.stringify(faults)}`);
    }
    // Signed as if committed ten blocks ago, so the launch is already open and
    // there is an epoch to mine. `h0` stays a real height the chain has passed.
    commitment = creation.commitmentFor(draft, vault.identity, tip - 10);
    if (!creation.idMatches(commitment)) throw new Error("commitment id does not match its terms");

    rules = {
      launch: commitment.id,
      version: launchData.PROTOCOL_VERSION,
      network: network.id,
      schedule: {
        ...emission.CANDIDATE,
        halfLife: BigInt(commitment.halfLife),
        decimals: commitment.decimals,
      },
      epochBlocks: commitment.epochBlocks,
      minClz: commitment.minClz,
      ticketSats: commitment.ticketSats,
    };
    s.ok(`${commitment.symbol} → ${commitment.id}  h0 ${commitment.h0}, clz ${MIN_CLZ}`);
  }

  const epoch = Math.floor((tip - commitment.h0) / commitment.epochBlocks);
  const epochOpensAt = commitment.h0 + epoch * commitment.epochBlocks;

  // 3 ── the block that opened the epoch
  let btcBlockHash;
  s = step("epoch block");
  {
    btcBlockHash = await provider.getBlockHash(epochOpensAt);
    s.ok(`epoch ${epoch} opened at ${epochOpensAt}  ${btcBlockHash.slice(0, 16)}…`);
  }

  // 4 ── the ticket: a real payment, burned, committed on chain
  const sink = reserveMod.reserveAddress(commitment.id);
  let ticketTxid;
  s = step("buy a ticket");
  {
    if (DRY_RUN) {
      s.skip(`would pay ${TICKET_SATS} sat to ${sink}`);
      ticketTxid = "00".repeat(32);
    } else {
      const memo = ticketMemo(commitment.id, epoch, vault.identity);
      const utxos = (await provider.getUtxos(vault.address)).filter((u) => u.confirmed);
      const signed = await vault.use((key) =>
        paymentMod.buildPayment(key, {
          to: sink,
          amountSats: TICKET_SATS,
          feeRate: FEE_RATE,
          utxos,
          memo,
        }),
      );
      const rate = (signed.selection.fee / signed.vsize).toFixed(2);
      ticketTxid = await provider.broadcast(signed.hex);
      s.ok(`${ticketTxid.slice(0, 16)}…  ${signed.vsize} vB, ${signed.selection.fee} sat (${rate}/vB)`);
      console.log(`      ${network.explorer}/tx/${ticketTxid}`);
    }
  }

  // 5 ── real work against the challenge the real txid derives
  let candidate;
  s = step("mine");
  {
    const challenge = challengeMod.challengeDigest({
      version: rules.version,
      network: rules.network,
      launch: rules.launch,
      epoch,
      btcBlockHash,
      ticket: ticketTxid,
      owner: vault.identity,
    });

    const started = Date.now();
    let nonce = 0n;
    for (;;) {
      const c = miningMod.recompute(challenge, nonce);
      if (c.clz >= MIN_CLZ) {
        candidate = { ...c, nonce };
        break;
      }
      nonce += 1n;
      if (nonce > 2_000_000_000n) throw new Error("no candidate found");
    }
    const seconds = (Date.now() - started) / 1000;
    const rate = Number(candidate.nonce) / Math.max(seconds, 0.001) / 1e6;
    s.ok(
      `clz ${candidate.clz} at nonce ${candidate.nonce}  ${rate.toFixed(2)} MH/s  ` +
        `${candidate.hash.slice(0, 20)}…`,
    );
  }

  // 6 ── the claim, written and then validated by replay
  mkdirSync(OUT_DIR, { recursive: true });
  const chainPath = `${OUT_DIR}${commitment.id}.json`;
  const ledger = createFileLedger({
    path: chainPath,
    rules,
    replay: ledgerRules.replay,
    decodeChain: ledgerDecode.decodeChain,
  });

  let minted;
  s = step("claim");
  {
    const record = await ledgerAuthor.signClaim(vault, ledger, rules, {
      epoch,
      btcBlockHash,
      nonce: candidate.nonce,
      clz: candidate.clz,
      ticket: ticketTxid,
      ticketSats: TICKET_SATS,
    });
    const state = ledger.append(record);
    minted = state.balances.get(vault.identity) ?? 0n;
    s.ok(`minted ${minted} atoms, reserve ${state.reserveSats} sat, head ${state.head.slice(0, 12)}…`);
  }

  // 7 ── a transfer to a second identity
  const recipient = keys.identityOf(keys.deriveKey(new Uint8Array(32).fill(0xe2)));
  s = step("transfer");
  {
    const amount = minted / 4n;
    const record = await ledgerAuthor.signTransfer(vault, ledger, rules, {
      to: recipient,
      amount,
      memo: "end-to-end run",
    });
    const state = ledger.append(record);
    s.ok(`sent ${amount} atoms; sender holds ${state.balances.get(vault.identity)}`);
  }

  // 8 ── an offer, signed and priced
  let offer;
  s = step("list an offer");
  {
    offer = await market.signOffer(vault, {
      launch: rules.launch,
      amount: minted / 8n,
      priceSats: 5_000n,
      expiresAt: tip + 144,
    });
    const fault = market.faultIn(offer, rules.launch);
    if (fault) throw new Error(`offer does not verify: ${fault}`);
    s.ok(`${market.offerId(offer.offer).slice(0, 16)}…  ${offer.offer.amount} atoms for 5000 sat`);
  }

  // 9 ── announce everything to the index
  s = step("announce");
  {
    const events = [
      { kind: "launch", launch: rules.launch, ref: creation.commitmentId(commitment), meta: JSON.stringify(commitment) },
      { kind: "mint", launch: rules.launch, amount: minted, sats: TICKET_SATS, ref: ledgerRules.recordIds(ledger.records())[0], txid: DRY_RUN ? undefined : ticketTxid },
      { kind: "offer", launch: rules.launch, amount: BigInt(offer.offer.amount), sats: Number(offer.offer.priceSats), ref: market.offerId(offer.offer) },
    ];
    // `publish`, not `record`: `record` writes the local mirror and fires the
    // POST without awaiting it, which is right for a browser — a claim that
    // succeeded is a claim whether or not an index heard — but here the whole
    // point is to know whether the index took it.
    let published = 0;
    for (const draft of events) {
      const signed = await activity.signActivity(vault, draft);
      activity.remember(signed);
      if (await activity.publish(signed)) published += 1;
    }
    if (published === 0) {
      s.skip(
        "index did not accept anything — start `npx wrangler dev` and set " +
          "VITE_API_BASE=http://127.0.0.1:8787",
      );
    } else if (published < events.length) {
      s.ok(`${published}/${events.length} accepted — the rest were refused`);
    } else {
      s.ok(`${published}/${events.length} accepted by the index`);
    }
  }

  // 10 ── the whole chain, from genesis, as a stranger would check it
  s = step("re-verify from genesis");
  {
    const state = ledgerRules.replay(ledger.records(), rules);
    if ((state.balances.get(vault.identity) ?? 0n) + (state.balances.get(recipient) ?? 0n) !== state.supply) {
      throw new Error("balances do not sum to supply");
    }
    if (!miningMod.verifyCandidate(
      challengeMod.challengeDigest({
        version: rules.version, network: rules.network, launch: rules.launch,
        epoch, btcBlockHash, ticket: ticketTxid, owner: vault.identity,
      }),
      candidate,
    )) {
      throw new Error("the winning candidate does not re-verify");
    }
    s.ok(`${state.length} records, supply ${state.supply}, conserved`);
  }

  console.log(`\nchain: ${chainPath}`);
  if (!DRY_RUN) console.log(`ticket: ${network.explorer}/tx/${ticketTxid}`);
  console.log("\nall steps passed\n");
  writeReport();
  return 0;
}

/** The OP_RETURN payload a ticket carries. Mirrors `hooks/useTicket.ts`. */
function ticketMemo(launch, epoch, identity) {
  const enc = new TextEncoder();
  const head = enc.encode(`btcfun:t1:${launch}:${epoch}:`);
  const who = enc.encode(identity.slice(0, 16));
  const out = new Uint8Array(head.length + who.length);
  out.set(head, 0);
  out.set(who, head.length);
  return out.slice(0, 80);
}

let code = 1;
try {
  code = await main();
} catch (err) {
  if (err instanceof WalletMissing) {
    console.error(`\n${err.message}\n`);
    code = 2;
  } else {
    code = fail(steps.at(-1)?.name ?? "startup", err);
  }
} finally {
  await close();
}
exit(code);
