---
title: Decisions — index
updated: 2026-09-23
status: draft
---

# Decisions

The current protocol distinguishes adopted requirements from candidates awaiting
validation. Superseded records preserve history and must not guide implementation.

| Record | Status | Effect |
|---|---|---|
| [Review and validation gates](2026-09-23-review-and-validation-gates.md) | Adopted | Phase gates, minimal demo, segregated backing, revised claims; economics still require E5 |
| [Testnet first](2026-09-22-testnet-first-no-mainnet.md) | Still applicable | Phase 4 review gate covers all real-fund flows |
| [Reserve floor](2026-09-23-reserve-floor-and-redemption.md) | Superseded | Automatic monotonicity and cost recovery disproved |
| [Pari-mutuel settlement](2026-09-23-pari-mutuel-epoch-settlement.md) | Superseded | Allocation candidate needs anti-dilution, admission and recovery rules |
| [Block decay](2026-09-23-emission-by-bitcoin-block-decay.md) | Superseded | Discrete cumulative ceiling replaces ambiguous per-block density; supply is not demand |
| [CKB/BTC reserve sequence](2026-09-22-ckb-reserve-first-btc-poc-parallel.md) | Superseded | One CKB-side asset first; native BTC implementation deferred |
| [Provable trust positioning](2026-09-22-positioning-provable-bitcoin-trust.md) | Superseded | Keep independent evidence; specify trust roots and avoid exclusivity/finality overclaims |
| [Q64.64 everywhere](2026-09-22-fixed-point-q64-64.md) | Superseded | Integer monetary amounts and explicitly justified decay approximation |

Future adoption: `E5` records economic rules; `V3`, `V6`, `V8`–`V10` record the
selected implementations and measured architecture envelope. None is decided by
the planning revision alone.
