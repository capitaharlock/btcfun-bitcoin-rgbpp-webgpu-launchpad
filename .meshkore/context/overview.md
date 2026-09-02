---
title: Overview
updated: 2026-09-23
status: draft
---

# btc.fun — overview

A community token launchpad exploring browser proof-of-work, a Bitcoin-block
emission schedule, RGB++ ownership and programmable settlement on Nervos CKB.
The product's differentiator is an independently checkable lifecycle: launch,
mine, settle, inspect the evidence, and redeem against a segregated reserve.

**Status: specification only.** No implementation, economic model, latency or
commercial demand has been validated. The September 23 review found defects in
the original reserve and issuance model; implementing those rules unchanged is
not the next step.

**Two objectives:** demonstrate deep, reproducible command of Bitcoin / RGB++ /
CKB / CKB-VM, and discover whether communities will repeatedly use the product.
Technical success and commercial success have separate acceptance gates.

**First work:** `economic-validation` (`E1`–`E5`, with `SH1`–`SH3`), then
`validate-architecture`. Roadmap and gate order: `.meshkore/docs/roadmap.md`.
The completed planning revision is anchored to `economic-validation / V0`.

**First demo:** one launch, one real wallet, one CKB-side reserve asset, browser
mining, correct settlement, redemption, independent verification and recovery
without the official operator. Automatic graduation and a marketplace are deferred.

`PROTOCOL.md` is the canonical behavioral specification. Read
`idea-evolution.md` for history, including why earlier guarantees were withdrawn.
