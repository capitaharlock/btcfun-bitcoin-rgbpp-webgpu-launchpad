---
id: testnet-spike
title: Testnet4 functional spike
status: active
priority: high
oneliner: "A working ticket-mine-claim-transfer loop on testnet4, built to find out what settlement actually has to solve."
modules:
  - web
  - mining
  - marketplace
target: Phase 0/1 — research spike, ahead of the economic and architecture gates
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [interface-prototype, validate-architecture, mining-engine, unified-marketplace, web-app]
---
# Testnet4 functional spike

## Why this exists

The roadmap permits research and disposable experiments ahead of the gates.
This one takes that allowance to answer questions that a specification cannot:
what a browser can actually mine, what a real ticket payment costs and feels
like, and precisely where a token market stops being implementable without
settlement.

Everything that can be real, is. The wallet derives a standard BIP84 key from
WebAuthn PRF output and signs real testnet4 transactions. Tickets are real
payments to a provably unspendable per-launch address. Claims and transfers are
secp256k1-signed records that replay from genesis under the §4.3
backing-limited allocation candidate. The emission schedule advances with the
live chain tip, because block height is the clock.

Everything that cannot be real is labelled, not simulated quietly. There is no
consensus over which record chain is *the* chain, nothing is anchored to a
Bitcoin UTXO, the reserve is burned rather than redeemable, and market swaps are
not atomic. Each of those is stated on the screen where it matters and in the
Proof Explorer's per-claim table.

The spike's most useful output is the last one. Building the offer book made the
atomicity gap concrete: the taker pays first, the maker signs second, and no
amount of care in the client closes it. That is exactly what RGB++ single-use
seals are for, and the offer format was shaped so `V3` can add the seal without
changing anything else.

## Done when

- A visitor can connect a wallet, fund it, buy a ticket, mine, claim, and hold
  a token whose provenance replays from genesis.
- Tokens transfer between identities under signatures anyone can check.
- Browser hashrate is measured on real hardware for both CPU and GPU, feeding `V7`.
- Offers are signed, verifiable and priced, with the settlement gap named.
- No screen claims settlement, redeemability, atomicity or capital protection.

## Task plan

- `#MN8` WebGPU kernel and the mining backend port
- `#LB4` passkey wallet and chain access on testnet4
- `#LB5` signed, replayable token ledger
- `#LB6` ticket purchase, claim flow and chain verification UI
- `#MK4` signed offer book and the atomicity boundary
