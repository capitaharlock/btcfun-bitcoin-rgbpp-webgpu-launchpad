---
id: OC1
title: "RGB++ toolchain, networks and a first xUDT between two wallets"
status: pending-operator
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

## Blocked on

Waiting on Bitcoin testnet3 funds for the end-to-end wallet (`tb1q93pwzegduvqq2mahaxy6vq0ydnz5yqv9kz7qc4`). CKB testnet funds are in place and the mint script is deployed; `npm run rgbpp:live` runs the whole path once the wallet is funded.
