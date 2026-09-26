---
id: LB9
title: "End-to-end runner against live testnet4"
status: done
priority: high
owner: rjj
category: code
initiative: testnet-spike
created: 2026-09-23
updated: 2026-09-23
---

A runner that performs the whole token lifecycle against the live network with
a funded wallet, so the claim "this works end to end" rests on a transaction
anyone can look up rather than on a suite of mocks.

The unit tests cover pure logic and the browser harness covers rendering.
Neither can answer the question that matters before showing this to anyone:
does a real payment, to a real node, produce a txid whose challenge yields work
that the real validator accepts?

## What it does

One run, in order: create a launch and check its identity derives from its own
terms; read the chain tip and the block that opened the epoch; pay a real ticket
to the launch's burn address with an OP_RETURN commitment and broadcast it; grind
real proof of work against the challenge that txid derives; sign a claim and let
`replay` validate it; transfer to a second identity; sign and verify an offer;
publish every step to the index; then replay the whole chain from genesis and
check balances sum to supply and the winning candidate still re-verifies.

## Design

**It runs the app's own modules.** `scripts/e2e/load.mjs` uses Vite's SSR loader,
so `domain/bitcoin/payment.ts` in a run is the file that ships, extensionless
imports and all. A second implementation of coin selection or challenge
derivation would only test itself. No new dependency — Vite is already how the
app is built.

**The ledger is a file, through the port.** Node has no localStorage, so rather
than shim it and test the shim, `scripts/e2e/ledger.mjs` satisfies the `Ledger`
interface with a file. That substitution is what the port exists for, and
`replay` is still the only thing that produces state. `localStorage` itself is
shimmed only where modules keep a local mirror — a browser API Node lacks, not
a stand-in for any of the app's logic.

**The wallet is a standard BIP39 phrase.** Stored in `.e2e-wallet.json`, ignored
by git, `chmod 600`, overridable by `E2E_MNEMONIC` for CI. Standard BIP84 path,
so the funds are never trapped in this tooling: any wallet can import the phrase
and sweep what is left.

**Testnet only, enforced.** `assertTestnet` refuses to run against a mainnet
build. This wallet signs unattended, in a loop, from a key on disk; every
property that makes it useful here makes it unacceptable for real money.

## Done when

- One command performs the lifecycle and prints an explorer link. — `npm run e2e`.
- It fails with the chain's own error, not an assertion about a mock. — done.
- No secret can reach the repository. — key file and run outputs are ignored;
  the address is the only thing printed by default.
- `--dry-run` exercises every step but the broadcast, so the pipeline is
  testable without spending. — done.

## Commands

    npm run e2e:wallet     create the wallet, print the address to fund
    npm run e2e:balance    what it holds, and whether a run can proceed
    npm run e2e:dry        everything except the broadcast
    npm run e2e            the real thing

`--min-clz` sets difficulty (default 20, about a second in Node), `--ticket-sats`
the ticket price, `--fee-rate` the sat/vB, `--keep` writes a JSON report.

Set `VITE_API_BASE` to a running Worker to capture the activity events; without
it the run still passes and says the index took nothing.

## Notes

The first version reported `3/3 events published` when the index had received
nothing: it called `record()`, which writes the local mirror and fires the POST
without awaiting it. That is right for a browser — a claim that succeeded is a
claim whether or not an index heard about it — but it makes the runner's own
output a lie. It now calls `publish()` and reports what the index actually
accepted.

Cost is about 2,300 sat per run: the ticket plus one transaction fee. Nothing is
recoverable, because the reserve address is provably unspendable — that is the
design, not a limitation of the runner.
