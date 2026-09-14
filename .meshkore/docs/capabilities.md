---
title: What is implemented, what is experimental, what is absent
category: docs
tags: [scope, trust, evidence]
updated: 2026-09-24
owner: rjj
status: active
related: [onchain-tokens, testnet-spike, web-app, provable-trust]
---

# Capabilities

One table separating what this repository implements from what its
architecture describes, so that neither can be read as the other. It is the
canonical answer to "what does btc.fun actually do"; `PROTOCOL.md` describes the
target, and `roadmap.md` says which gates stand between the two.

Nothing below is aspirational. A row is *implemented* only if it exists in
`contracts/` or `apps/web` today and is covered by a test or a browser
verification. *Implemented* does not mean *run live*: see the next section.

## Implemented

| Capability | What it actually does | Where |
|---|---|---|
| Standard reward | `floor(10^8 × clz² / 2^k)` in exact integers, Rust and TypeScript checked against the same vectors | `contracts/mint-core`, `lib/standard.ts`, `contracts/vectors/reward.json` |
| Mint script | Rust `no_std` type script enforcing open, ticket, mint and close of a miner cell, the promoter payment, the anchor window and the exact reward; 24 CKB-VM tests including the rejected cases | `contracts/mint`, `contracts/tests` |
| Mint script on CKB testnet | Deployed with `hash_type: data1` in an unspendable cell, code hash `0xb8af59e9…c72f`; cycles per whole transaction: open ~42k, ticket ~273k, mint ~313k | `contracts/deployments/testnet.json` |
| RGB++ operations | Plans for open, ticket, mint and transfer; the commitment, pinned by test to the RGB++ SDK and lock; the signed Bitcoin side; hand-off to the RGB++ queue service | `lib/rgbpp/` |
| Token identity | A launch is identity, promoter address and opening height; its terms are the mint script args, so the xUDT type hash commits to them | `lib/rgbpp/launch.ts`, `lib/launches/create.ts` |
| Browser mining | CPU workers and a WebGPU kernel over the ticket's challenge, reward shown live; every GPU candidate re-hashed on the CPU | `lib/mining/` |
| Wallet | WebAuthn PRF → BIP39 → BIP84, P2WPKH on testnet3; a standard mnemonic, so coins are sweepable elsewhere | `lib/bitcoin/` |
| Holdings and transfers | Balances read from xUDT cells sealed to the wallet's outputs; a transfer is one Bitcoin transaction | `views/Holdings.tsx` |
| Sales | Seller signs its token UTXO and price with `SIGHASH_SINGLE \| ANYONECANPAY`; the buyer completes and broadcasts alone | `lib/rgbpp/sale.ts`, `views/Market.tsx` |
| Proof page | Recomputes a mint from the Bitcoin and CKB transactions: commitment, ticket, hash, amount | `lib/rgbpp/verify.ts`, `views/Proof.tsx` |
| Activity index | One Cloudflare Worker over D1 storing signed announcements and listings; re-verified by every reader, never authoritative | `worker/` |
| Browser suite | 65 tests over simulated Bitcoin, RGB++ and CKB, with the mint rules as the oracle | `apps/web/e2e/` |

## Pending — built, not yet exercised live

| Capability | What is missing |
|---|---|
| Live RGB++ run | The testnet3 ticket, mint, transfer and sale through the queue service (`OC8`); pending funds |
| Listings in the public index | The deployed Worker must be redeployed to carry listing payloads |
| Explorer visibility | Not yet confirmed that an RGB++ explorer shows a minted balance under the launch's type hash |

## Absent

Named here so that no screen, comment or README can be read as implying them.

| Capability | Blocked on |
|---|---|
| Confirmation policy, reorg treatment | `V8` |
| Who pays CKB capacity for miner cells, beyond the paymaster | `OC3` |
| Wallets other than the app's own | `V3` |
| Metadata and image storage on-chain | `TC2` |
| Venue integration, automatic graduation | `LQ1`, `GR*` — deferred |
| Independent protocol review, mainnet readiness | `SH6`, `SH7` |

Withdrawn rather than absent: the browser-local signed ledger, epoch budgets,
pari-mutuel allocation, the 21M cap, the ticket-funded reserve and redemption.
The standard issues no reserve and promises no floor.

## The honest summary

The rule is enforced on-chain by a deployed script, the client builds every
operation the standard needs, and each step is independently checkable from the
two chains. What has not happened yet is the whole path running live on testnet
with real wallets; until it has, no mint through the app is claimed.
