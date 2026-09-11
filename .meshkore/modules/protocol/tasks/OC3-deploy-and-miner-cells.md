---
id: OC3
title: "Deploy the mint script and open miner cells"
status: in_progress
priority: high
owner: rjj
category: protocol
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
---

Deploy the mint script to CKB testnet with a recorded code hash, and decide who
provides the capacity that opening a miner cell needs.

## Done when

- The deployment transaction and code hash are recorded in the app's network
  configuration and in `TEST_RESULTS.md`.
- Opening a miner cell works for a wallet that holds only Bitcoin, with the
  capacity policy written down and its cost measured.

## Progress

- 2026-09-24 — deployed to CKB testnet in
  `0x68b45da25241d190fa91ee143a6e966c4224e2decec1b34f6abd3d169f7176e8`, code hash
  `0x73ea88fe…0616` (`data1`), 73,552 bytes, under a lock nobody holds a key
  for. `contracts/rust-toolchain.toml` pins the compiler; a rebuild reproduces
  the same hash. Record: `contracts/deployments/testnet.json`.
