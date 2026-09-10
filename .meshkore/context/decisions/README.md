---
title: Decisions — index
updated: 2026-09-24
status: draft
---

# Decisions

The current protocol distinguishes adopted requirements from candidates awaiting
validation. Superseded records preserve history and must not guide implementation.

| Record | Status | Effect |
|---|---|---|
| [Standard tokenomics and instant mint](2026-09-24-standard-tokenomics-and-instant-mint.md) | Adopted | One rule set for every launch; per-ticket mint `10^8·clz²/2^k`; weekly halving; no cap, no reserve; ticket income to the promoter |
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
