---
title: Roadmap and acceptance gates
category: docs
tags: [roadmap, validation]
updated: 2026-09-24
owner: rjj
status: draft
related: [onchain-tokens, economic-validation, validate-architecture, product-validation]
---

# btc.fun — roadmap and acceptance gates

**Current state: testnet implementation. Active work: `onchain-tokens` (`OC1`–`OC8`).**
The economic model is decided by the standard tokenomics (`PROTOCOL.md` §4,
[decision](../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md)).
The mint script is deployed on CKB testnet and the client builds every RGB++
operation; the live end-to-end run is pending funds. No pilot or independent
review is marked complete.

The two goals have independent success criteria: demonstrate reproducible technical
depth and discover repeat community demand. Neither success is inferred from the
other. The first release target is a reviewable testnet demonstration.

## Execution order

| Phase | Work | Evidence required to advance |
|---|---|---|
| 0 — Correct the model | Decided by the standard tokenomics ADR (2026-09-24); E1–E5 superseded as a gate. SH1–SH3 threat and attack analysis continues against the standard; prepare PV1 | Adopted ADR, exact integer arithmetic and shared Rust/TypeScript vectors — held. Attack analysis of the standard still open |
| 1 — Prove the architecture | OC1–OC8 (active); V3, V8 and remaining V-tasks as they apply; LQ1 research | Mint script enforced on CKB testnet, RGB++ mint/transfer/sale with real wallets, SPV-proven clock and confirmation policy, completion without the queue service, measured cycles, capacity and fees |
| 2 — Deliver the verifiable demo | PC1–PC8, TC1–TC3, MN1–MN7, IX1/IX2/IX4, WA1–WA6, BL1, GR4, SH4 baseline | Integrated valid/invalid flows, portable verifier, operator shutdown recovery and dual-chain reorg evidence |
| 3 — Validate the product | PV1–PV3; IX3 if needed | Predeclared pilot thresholds, observed repeat use/comprehension, cost model and explicit go/narrow/pivot/demo-only decision |
| 4 — Prepare real-fund production | SH4–SH7 | Independent review/remediation, reproducible artifacts, operations drills, commercial readiness and explicit launch decision |
| 5 — Expand where justified | GR1–GR3/GR5, LQ2–LQ4, MK1–MK3 | Separate liquidity funding and rights; actual venue support; product justification; review of any new economic/fund-controlling behavior |

Tasks list direct prerequisites; all work also inherits the phase gates in this
table. Research and disposable UX experiments may run early, but production
implementation of new economics waits for an adopted ADR. Phase 5 research is not
permission to release new real-fund behavior without reopening relevant reviews.

`V0` and the E-series are planning history; the standard answers the questions
they posed. `onchain-tokens` is the active initiative. Initiative files retain
stable IDs; priorities identify risk, while phases and prerequisites define order.
No dates are promised before the spike establishes the work and cost envelope.

## First demo acceptance packet

- One launch and one real wallet/network path (Bitcoin testnet3 with CKB testnet).
- Pinned source/toolchains, reproducible RISC-V binaries, script/deployment hashes,
  raw transactions, the standard's constants and reference vectors.
- A ticket, a mint, a transfer between two wallets and a sale completed by a
  buyer while the seller is offline, confirmed on-chain; minted amounts match
  what the app displayed and what an RGB++ explorer shows.
- Browser and CLI verify exported evidence independently of the official backend,
  with explicit chain-selection, SPV, finality and data-availability assumptions.
- Insufficient hash, reused ticket, inflated amount, unpaid ticket, tampered
  proof and stale/replaced Bitcoin-block cases fail on-chain or produce the
  specified recovery state.
- Disable the official service: a third party completes the committed CKB
  transaction with its own SPV proof. Exercise dual-chain reorg scenarios.
- Publish total bytes/cycles, locked capacity, fees, wallet interactions, latency
  distributions, batch limits and known unsupported cases. Distinguish measured
  network results from deterministic fixtures and estimates.

Completing a front-end happy path or matching two implementations of the same bug
does not pass this gate. Automatic graduation is not part of the demo.

## Product gate

PV1 defines audience, recruitment, measurement denominators and numeric decision
thresholds before pilots. Lightweight UX discovery starts early; pilots of the
actual system wait for Phase 2. PV2 reports completion, return behavior, economic
comprehension, device/reward concentration and operating cost. PV3 records whether
to proceed, narrow scope, redesign or preserve the result as a technical demo.

Testnet validates usability but does not establish real willingness to pay. Any
later paid-demand experiment must first pass Phase 4. If demand is weak, do not
build a marketplace to compensate for it.

## Deliberately deferred

- Automatic graduation and protocol-funded liquidity. A future market needs its
  own funded asset sides and reviewed ownership rights.
- Multiple wallets, Fiber/Lightning, jackpots, fundraising/vesting, a custom AMM,
  creator-configurable economics, full charts/P&L and broad market APIs.
- Blanket fairness, capital-protection or instant Bitcoin-finality claims.

## Navigation

- [Real tokens on RGB++ and CKB](../roadmap/initiatives/onchain-tokens.md) — active
- [Economic validation](../roadmap/initiatives/economic-validation.md) — superseded as a gate
- [Architecture proof](../roadmap/initiatives/validate-architecture.md)
- [Emission and reserve core](../roadmap/initiatives/emission-core.md) — superseded by the standard
- [Independent verification](../roadmap/initiatives/provable-trust.md)
- [Community validation](../roadmap/initiatives/product-validation.md)
- [Security and production](../roadmap/initiatives/security-hardening.md)
- [Design review](design-review.md)
- [Canonical protocol](../../PROTOCOL.md)
