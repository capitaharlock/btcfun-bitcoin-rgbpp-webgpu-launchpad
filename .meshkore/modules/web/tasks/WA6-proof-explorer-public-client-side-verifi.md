---
id: WA6
title: "Proof Explorer with declared trust roots and negative cases"
status: backlog
priority: critical
owner: rjj
category: web
initiative: provable-trust
created: 2026-09-23
updated: 2026-09-23
---

Build a browser verifier for binding/authorization, accepted clock, allowance expiry, work validity, admission/closure, allocation and reserve reconciliation.

## Execution

- Phase: 2.
- Prerequisites: `MN6`, `IX2`, `V3`, `V8`.

## Done when

- Evidence can be exported and verified without btc.fun’s backend using user-selected public sources or local nodes.
- Expose exactly what was verified, chain-selection/confirmation assumptions and provisional status.
- Tampered, omitted, stale and unavailable data are visibly distinct from valid evidence.
- Do not equate valid work with economic fairness or public RPC access with canonicality proof.
