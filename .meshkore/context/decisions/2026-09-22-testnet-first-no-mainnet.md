---
title: Testnet-first, no mainnet until reviewed
updated: 2026-09-22
status: stable
---

> **Still applies.** The revised roadmap places the production gate in Phase 4
> (`SH4`–`SH7`) and applies it to every real-fund flow, not only graduation.
> The original initiative/section numbers below are historical.


**Context**: This is also a technology-competence demonstration project, not
just a product. Shipping an emission engine that mishandles reserve accounting
or overflow would be worse than shipping late.

**Decision**: No mainnet deployment until economic invariants (supply cap,
reserve reconciliation, overflow, double-graduation, slippage enforcement)
are extensively tested AND every protocol script controlling funds has had
an independent review (spec §9, §14).

**Consequences**: Initiative 9 (security hardening) is a hard gate on
Initiative 6/7/8 shipping to mainnet, not a parallel nice-to-have.
