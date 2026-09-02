---
title: "Growth strategy: provable Bitcoin-native trust, not marketing claims"
updated: 2026-09-22
status: superseded
---

> **Historical decision — superseded by [2026-09-23-review-and-validation-gates](2026-09-23-review-and-validation-gates.md).**
> The original record below is preserved as history, not current guidance.
> Consult `PROTOCOL.md` and the new ADR for adopted scope and unresolved hypotheses.


**Context**: The target audience is the most skeptical in crypto about
"Bitcoin-native" claims, since most Bitcoin-L2 tokens are bridged assets
secured by an unauditable multisig. Competing on the same unverifiable
claim wastes RGB++'s one structurally unique property.

**Decision**: Make isomorphic binding checkable, not claimed — a public
per-token Proof Explorer that re-derives the binding client-side, plus a
Build Log sourced from this project's own decision records.

**Consequences**: RGB++ terminology must stay exact everywhere (§3/§4),
since the Proof Explorer invites technical scrutiny by design. See
initiative `provable-trust`.
