---
id: OC1
title: "RGB++ toolchain, networks and a first xUDT between two wallets"
status: done
priority: critical
owner: rjj
category: validation
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
completed_at: 2026-09-24T14:40:00Z
---

Pin the current RGB++ SDK and CCC, find the Bitcoin network the public RGB++
services verify, fund both test wallets on it and on CKB testnet, and move a
plain xUDT from one wallet to the other.

## Done when

- The supported network is recorded with evidence (service health, SPV tip).
- Both wallets hold testnet BTC and CKB; the secrets stay out of the repository.
- An xUDT is issued to a Bitcoin UTXO and transferred to the second wallet;
  both transactions are linked from `.meshkore/docs/test-results.md`.

## Resolution

The public RGB++ services verify Bitcoin testnet3, which is now the app's only network. With both wallets funded, a launch was opened, ticketed, mined, minted, transferred and sold on testnet3 and CKB testnet; every transaction is linked from `.meshkore/docs/test-results.md` (live section). The one failure on the way — the paymaster lock's missing dependency — was fixed in the planner and is now refused by the simulated queue.
