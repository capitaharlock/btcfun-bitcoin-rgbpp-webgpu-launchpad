---
id: WA6
title: "Proof Explorer with declared trust roots and negative cases"
status: backlog
priority: critical
owner: rjj
category: web
initiative: provable-trust
created: 2026-09-23
updated: 2026-09-24
---

The proof page recomputes commitment, ticket, disarm, work and amount of any mint from chain data (`apps/web/src/pages/Proof.tsx`, `domain/rgbpp/verify.ts`). What remains is portability and declared trust roots.

## Execution

- Phase: 2.
- Prerequisites: `V3`, `V8`.

## Done when

- Evidence can be exported as a bundle and verified without btc.fun's backend, against user-selected public sources or a local node.
- Each check states what it verified and its chain-selection and confirmation assumptions.
- Tampered, omitted, stale and unavailable data are visibly distinct from valid evidence.
- Valid work is not equated with economic fairness, nor public RPC access with canonicality.
