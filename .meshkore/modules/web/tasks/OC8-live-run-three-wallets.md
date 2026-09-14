---
id: OC8
title: "Live end-to-end run with three wallets"
status: pending-operator
priority: high
owner: rjj
category: web
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
---

Extend the live browser run: a promoter creates a launch, a miner buys tickets,
mines and mints, transfers to a second wallet, lists part for sale, and a third
wallet buys it with the seller offline.

## Done when

- Every step is confirmed on-chain and linked from `TEST_RESULTS.md`.
- The invalid-mint cases from `OC2` are attempted from the browser and rejected.

## Blocked on

Waiting on the same testnet3 funds as OC1. The deterministic browser suite already covers every step over simulated chains.
