---
title: "Emission decays by Bitcoin block height; unmined budget burns"
updated: 2026-09-23
status: superseded
---

> **Historical decision — superseded by [2026-09-23-review-and-validation-gates](2026-09-23-review-and-validation-gates.md).**
> The original record below is preserved as history, not current guidance.
> Consult `PROTOCOL.md` and the new ADR for adopted scope and unresolved hypotheses.


**Context**: Decay by minted supply froze dead launches at full reward,
pricing neglect instead of attention, and removed the coordination game
that makes a mint viral.

**Decision**: `B(h) = B₀·2^(−(h−h₀)/1008)` on Bitcoin height (1008 = half a
difficulty period ≈ 1 week). Unmined epoch budget is burned permanently.
`MAX_SUPPLY` is 21M for every token; circulating supply becomes a
measurement of demand during the 21-day window (87.5% offered by then).

**Consequences**: A launch without traction dies small and cannot be
revived later — intended. Supply is comparable across tokens, so the
half-life stays fixed in v1 rather than creator-configurable.
