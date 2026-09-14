---
id: OC3
title: "Deploy the mint script and open miner cells"
status: done
priority: high
owner: rjj
category: protocol
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [73af52d, 1299b37, 1df6a72]
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
- 2026-09-24 — redeployed after pricing mints at the ticket's anchor:
  `0x3869513d5debb86e1334b268067e31cb322d06ad20353fde1e9b105d89e34611`, code
  hash `0xb8af59e9…c72f`. The first deployment stays on chain and in the record
  under `superseded`; no launch was created against it.
- Capacity policy: a miner cell is opened through the RGB++ paymaster (7,000
  sats on testnet), sized at its occupied capacity plus 10 CKB for fees; a
  first mint borrows the token cell's capacity the same way. A person holding
  only Bitcoin can therefore mine.

## Resolution

Deployed to CKB testnet with `hash_type: data1` in an unspendable cell; the record, toolchain pin and superseded first deployment are in `contracts/deployments/testnet.json`. A miner cell is opened through the RGB++ paymaster (7,000 sats on testnet) at its occupied capacity plus 10 CKB for fees, and a first mint borrows the token cell's capacity the same way, so a person holding only Bitcoin can mine.
