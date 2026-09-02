---
title: "CKB-side reserve first, BTC-reserve proof-of-concept in parallel"
updated: 2026-09-23
status: superseded
---

> **Historical decision — superseded by [2026-09-23-review-and-validation-gates](2026-09-23-review-and-validation-gates.md).**
> The original record below is preserved as history, not current guidance.
> Consult `PROTOCOL.md` and the new ADR for adopted scope and unresolved hypotheses.


**Context**: Mining Ticket income has to be denominated and escrowed in
something. A BTC-UTXO reserve tells the strongest story; a CKB-side asset
is far simpler to settle atomically per epoch.

**Decision**: Build the reserve/floor engine against a CKB-compatible asset
first, behind a replaceable interface, and prototype a BTC-reserve PoC
alongside. Do not freeze either before both are benchmarked.

**Consequences**: A development-sequence decision, not the final answer —
the reserve-asset ADR is still an Initiative 0 deliverable (`#V6`).
