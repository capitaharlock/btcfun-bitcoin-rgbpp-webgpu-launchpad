---
id: OC1
title: "RGB++ toolchain, networks and a first xUDT between two wallets"
status: in_progress
priority: critical
owner: rjj
category: validation
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
---

Pin the current RGB++ SDK and CCC, find the Bitcoin network the public RGB++
services verify, fund both test wallets on it and on CKB testnet, and move a
plain xUDT from one wallet to the other.

## Done when

- The supported network is recorded with evidence (service health, SPV tip).
- Both wallets hold testnet BTC and CKB; the secrets stay out of the repository.
- An xUDT is issued to a Bitcoin UTXO and transferred to the second wallet;
  both transactions are linked from `TEST_RESULTS.md`.
