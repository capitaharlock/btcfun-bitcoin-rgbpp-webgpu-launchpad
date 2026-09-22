---
title: Decisions — index
updated: 2026-09-25
status: draft
---

# Decisions

The current protocol distinguishes adopted requirements from candidates awaiting
validation. Superseded records preserve history and must not guide implementation.

| Record | Status | Effect |
|---|---|---|
| [Paid registration and certificate](2026-09-25-paid-registration-and-certificate.md) | Adopted | A launch pays 20,000 sats once and is admitted by btc.fun's certificate, which the mint script requires at every miner's first arming; nobody opens an idle cell |
| [One payment per round](2026-09-25-one-payment-per-round.md) | Adopted | Ticket 14,983 sats, always: 7,000 paymaster when the round creates its cell, 11 % of the rest to the platform, the remainder to the promoter; a created cell is `paid` and armed by a network-fee-only signature; a mint pays only the network |
| [Standard tokenomics and instant mint](2026-09-24-standard-tokenomics-and-instant-mint.md) | Adopted, price superseded | One rule set for every launch; per-ticket mint `10^8·clz²/2^k`; weekly halving; no cap, no reserve. Its ticket price is replaced by the record above |
| [Platform fee per ticket](2026-09-24-platform-fee-per-ticket.md) | Superseded | The 10,000-sat ticket split 9,500 / 500; replaced by one payment per round |
| [Peer-to-peer order book](2026-09-24-peer-to-peer-order-book.md) | Adopted | The market is bids and asks between users; no pool, AMM, market maker or custody; a bid is a signed intention the bidder completes |
| [Review and validation gates](2026-09-23-review-and-validation-gates.md) | Partly superseded | Evidence gates and claim discipline stand; the 21M ceiling, epoch economics and reserve are replaced by the standard tokenomics |
| [Testnet first](2026-09-22-testnet-first-no-mainnet.md) | Still applicable | Phase 4 review gate covers all real-fund flows |
| [Reserve floor](2026-09-23-reserve-floor-and-redemption.md) | Superseded | Automatic monotonicity and cost recovery disproved |
| [Pari-mutuel settlement](2026-09-23-pari-mutuel-epoch-settlement.md) | Superseded | Allocation candidate needs anti-dilution, admission and recovery rules |
| [Block decay](2026-09-23-emission-by-bitcoin-block-decay.md) | Superseded | Discrete cumulative ceiling replaces ambiguous per-block density; supply is not demand |
| [CKB/BTC reserve sequence](2026-09-22-ckb-reserve-first-btc-poc-parallel.md) | Superseded | One CKB-side asset first; native BTC implementation deferred |
| [Provable trust positioning](2026-09-22-positioning-provable-bitcoin-trust.md) | Superseded | Keep independent evidence; specify trust roots and avoid exclusivity/finality overclaims |
| [Q64.64 everywhere](2026-09-22-fixed-point-q64-64.md) | Superseded | Integer monetary amounts and explicitly justified decay approximation |

The standard tokenomics settles the economic rules. The on-chain initiative
records the selected implementation — mint script, RGB++ tooling, network and
capacity policy — and its measurements.
