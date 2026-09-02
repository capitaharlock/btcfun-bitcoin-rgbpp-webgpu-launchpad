---
title: "Ticket income escrows into a redeemable, monotonically rising floor"
updated: 2026-09-23
status: superseded
---

> **Historical decision — superseded by [2026-09-23-review-and-validation-gates](2026-09-23-review-and-validation-gates.md).**
> The original record below is preserved as history, not current guidance.
> Consult `PROTOCOL.md` and the new ADR for adopted scope and unresolved hypotheses.


**Context**: Mining alone produces a bag with no price and no exit, and
ticket income paid to creators would make the product a rug machine.

**Decision**: Ticket income escrows into a reserve. `floor = reserve /
circulating`, redeemable at any time. Redemption at exactly that price is
floor-invariant. The creator allocation unlocks only at graduation.

**Consequences**: Because tokens-per-ticket decays, the floor rises
monotonically — anyone mining earlier than the average is provably never
below it. Non-graduating tokens stay redeemable forever, so a launch can go
quiet but cannot rug.
