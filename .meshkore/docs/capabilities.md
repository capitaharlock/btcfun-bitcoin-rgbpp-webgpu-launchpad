---
title: What is implemented, what is experimental, what is absent
category: docs
tags: [scope, trust, evidence]
updated: 2026-09-23
owner: rjj
status: active
related: [testnet-spike, web-app, provable-trust]
---

# Capabilities

One table separating what this repository implements from what its
architecture describes, so that neither can be read as the other. It is the
canonical answer to "what does btc.fun actually do"; `PROTOCOL.md` describes the
target, and `roadmap.md` says which gates stand between the two.

Nothing below is aspirational. A row is *implemented* only if it runs in
`apps/web` today and is covered by a test or a browser verification.

## Implemented

| Capability | What it actually does | Where |
|---|---|---|
| Emission schedule | Integer `A(n) = floor(M × (1 − 2^(−n/H)))` in Q64.64, checked against an exact integer reference | `lib/emission.ts` |
| Browser mining | CPU workers and a WebGPU compute kernel, auto-tuned; every GPU candidate re-hashed on the CPU before use | `lib/mining/` |
| Wallet | WebAuthn PRF → BIP39 → BIP84 `m/84'/1'/0'/0/0`, P2WPKH on testnet4; the mnemonic is standard, so coins are sweepable elsewhere | `lib/bitcoin/` |
| Bitcoin payments | Coin selection, fee from measured transaction shape, OP_RETURN memos, broadcast via a mempool API | `lib/bitcoin/payment.ts` |
| Signed ledger | Hash-chained records, ECDSA per record, replay-from-genesis as the only state producer, exhaustive decoding at the storage boundary | `lib/ledger/` |
| Launch commitments | A launch is a signed object whose identity is the digest of its own terms | `lib/launches/create.ts` |
| Offer book | Signed offers, payment bound to an offer by OP_RETURN, settlement joined across offer, payment and delivery | `lib/market/` |
| Activity index | One Cloudflare Worker over D1; verifies with the same module the client runs, stores, serves | `worker/` |
| Proof Explorer | Per-claim statement of what each check establishes and what it rests on | `views/Proof.tsx` |

## Experimental — real, but not what it will be

| Capability | What is real | What is not |
|---|---|---|
| Tickets | A real testnet4 payment, broadcast, with a commitment in an OP_RETURN | The destination is an address with no known key. Funds are burned, not held |
| Reserve | The sum of tickets a chain's own records declare | Not redeemable, not enforced by any script, not a custody arrangement |
| Ownership | A real signature: nobody can move tokens they do not hold, and anyone can replay to the same balances | Not settlement. Two conflicting histories are equally valid to a verifier |
| Proof of work | Real: the nonce genuinely produces the stated leading zeros against a derived challenge | Proof of effort, not of admission. No canonical set of who else competed |
| Public activity | Signed by the actor and re-checked by every reader | Statements, not receipts. Nothing proves the event they describe occurred |
| Allocation rule | `floor(ΔR × S / R)` implemented and tested | A `§4.3` candidate. `E1`–`E5` have not passed; not adopted economics |

## Absent

Named here so that no screen, comment or README can be read as implying them.

| Capability | Blocked on |
|---|---|
| RGB++ ownership, single-use seals | `V3` — no RGB++ SDK is in the dependency tree |
| CKB settlement, xUDT, CKB-VM scripts | `V2`, `V3` — no Rust, no contracts in this repository |
| Atomic swaps | `V3`. Today the taker pays first and the maker may never deliver; this is stated in the market UI |
| Redemption against the reserve | `V6` — there is no reserve asset to redeem against |
| SPV proofs, Bitcoin clock policy, reorg handling | `V8` — replay takes txids and block hashes from the record itself |
| Admission completeness, pari-mutuel allocation within an epoch | `E3`, `V9` — the current rule is sequential and single-participant |
| Automatic graduation, liquidity routing | `GR*`, `LQ*` — deferred by the September 23 review |
| Independent protocol review, mainnet readiness | `SH6`, `SH7` |

## The honest summary

An end-to-end demonstration exists: create a launch, pay a real testnet4 ticket,
mine real proof of work in the browser, sign a claim, hold a balance anyone can
re-derive, list it, and see it in a public feed. Every cryptographic step is
genuine and independently checkable.

What is missing is the part that makes any of it binding on anyone else.
