---
id: V8
title: "Bitcoin clock, SPV, freshness and dual-chain reorg policy"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-23
---

Prototype how CKB verifies the accepted Bitcoin height/hash and how the protocol advances epochs under an explicit finality policy.

## Execution

- Phase: 1.
- Prerequisites: `V1`, `SH1`, `E5`.

## Done when

- Specify headers/SPV source, chain selection, confirmation depth, lag bound, monotonic cursor and delayed-relayer behavior.
- Reject fabricated/stale clock inputs according to the policy; inclusion alone is not treated as proof of latest tip.
- Exercise same-height Bitcoin hash replacement and CKB reorgs, including a CKB transition already referring to a replaced Bitcoin branch.
- Publish residual finality assumptions, recovery/pause rules and the user-visible status model.
