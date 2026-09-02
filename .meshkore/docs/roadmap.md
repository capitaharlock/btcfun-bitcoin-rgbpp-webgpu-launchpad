---
title: Roadmap and acceptance gates
category: docs
tags: [roadmap, validation]
updated: 2026-09-23
owner: rjj
status: draft
related: [economic-validation, validate-architecture, product-validation]
---

# btc.fun — roadmap and acceptance gates

**Current state: specification only. Next executable task: E1.**
V0 records the completed planning revision, not completion of economic validation.
No implementation, pilot, benchmark or security review is marked complete.

The two goals have independent success criteria: demonstrate reproducible technical
depth and discover repeat community demand. Neither success is inferred from the
other. The first release target is a reviewable testnet demonstration.

## Execution order

| Phase | Work | Evidence required to advance |
|---|---|---|
| 0 — Correct the model | E1–E5 with SH1–SH3; prepare PV1 | Reproducible failures; complete replacement state machine, simulations, discrete arithmetic and adoption/rejection ADR |
| 1 — Prove the architecture | V1–V10; LQ1 research | Real-wallet authorization, accepted clock/SPV policy, reserve asset, operator-free recovery, exact math, full-cycle cost and batch envelope |
| 2 — Deliver the verifiable demo | PC1–PC8, TC1–TC3, MN1–MN7, IX1/IX2/IX4, WA1–WA6, BL1, GR4, SH4 baseline | Integrated valid/invalid flows, portable verifier, operator shutdown recovery and dual-chain reorg evidence |
| 3 — Validate the product | PV1–PV3; IX3 if needed | Predeclared pilot thresholds, observed repeat use/comprehension, cost model and explicit go/narrow/pivot/demo-only decision |
| 4 — Prepare real-fund production | SH4–SH7 | Independent review/remediation, reproducible artifacts, operations drills, commercial readiness and explicit launch decision |
| 5 — Expand where justified | GR1–GR3/GR5, LQ2–LQ4, MK1–MK3 | Separate liquidity funding and rights; actual venue support; product justification; review of any new economic/fund-controlling behavior |

Tasks list direct prerequisites; all work also inherits the phase gates in this
table. Research and disposable UX experiments may run early, but production
implementation of unresolved economics waits for adoption. Phase 5 research is not
permission to release new real-fund behavior without reopening relevant reviews.

`V0` is planning history. `E1` is the single next task. Initiative files retain
stable IDs; priorities identify risk, while phases and prerequisites define order.
No dates are promised before the spike establishes the work and cost envelope.

## First demo acceptance packet

- One launch, one named CKB-side reserve asset and one real wallet/network path.
- Pinned source/toolchains, reproducible RISC-V binaries, script/deployment hashes,
  raw transactions, canonical economic rules and reference vectors.
- At least two miners settle; unused allowance expires; claims and intermediate/
  final redemptions reconcile to the adopted integer accounting.
- Browser and CLI verify exported evidence independently of the official backend,
  with explicit chain-selection, SPV, finality and data-availability assumptions.
- Deliberate unauthorized mint, tampered proof, replay, omitted submission and
  stale/replaced Bitcoin-block cases fail or produce the specified recovery state.
- Disable the official service: a third party completes settlement or a bounded
  refund/exit. Exercise long inactivity and dual-chain reorg scenarios.
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

- Automatic graduation and reserve-funded liquidity. Backing remains segregated;
  a future market needs its own funded asset sides and reviewed ownership rights.
- Multiple wallets/reserve assets, native BTC reserve, Fiber/Lightning, jackpots,
  fundraising/vesting, full charts/P&L and broad market APIs.
- Blanket fairness, capital-protection or instant Bitcoin-finality claims.

## Navigation

- [Economic validation](../roadmap/initiatives/economic-validation.md)
- [Architecture proof](../roadmap/initiatives/validate-architecture.md)
- [Emission and reserve core](../roadmap/initiatives/emission-core.md)
- [Independent verification](../roadmap/initiatives/provable-trust.md)
- [Community validation](../roadmap/initiatives/product-validation.md)
- [Security and production](../roadmap/initiatives/security-hardening.md)
- [Design review](design-review.md)
- [Canonical protocol](../../PROTOCOL.md)
