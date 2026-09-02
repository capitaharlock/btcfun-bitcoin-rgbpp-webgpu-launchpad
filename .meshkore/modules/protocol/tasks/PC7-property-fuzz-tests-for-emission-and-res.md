---
id: PC7
title: "Property, differential and fuzz checks for adopted invariants"
status: backlog
priority: high
owner: rjj
category: protocol
initiative: emission-core
created: 2026-09-23
updated: 2026-09-23
---

Exercise the economic and authorization state machine, using Phase 0 counterexamples as regression cases and an independent model.

## Execution

- Phase: 2.
- Prerequisites: `PC2`, `PC3`, `PC6`, `PC8`.

## Done when

- Check conservation, bounded issuance, expiry permanence, liability accounting, rounding and unauthorized-mint prevention.
- Cover zero/final supply, unclaimed rewards, burns, long inactivity and concurrent transition sequences.
- Invalid proofs, omissions, overflows and unsupported state transitions are rejected.
- CI publishes reproducible seeds/corpus and bounded fuzz runs; no false exact floor-invariance assertion.
