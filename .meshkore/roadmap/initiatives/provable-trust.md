---
id: provable-trust
title: "Independent verification and evidence"
status: backlog
priority: critical
oneliner: "Make authorization, issuance, membership, allocation and reserve accounting checkable."
modules:
  - web
  - mining
  - docs
target: "Phase 2 \u2014 Required demo evidence"
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [validate-architecture, mining-engine, web-app]
---

# Independent verification and evidence

## Why this exists

This is a core competence deliverable. Verification must identify missing or stale evidence and state chain-selection assumptions rather than presenting a reproducible queue as complete proof.

## Execution and gate

Build alongside the minimal lifecycle, before community pilots. Canonical task ownership stays here for MN6, WA6 and BL1.

Gate order and shared evidence: [roadmap](../../docs/roadmap.md).

## Done when

- Standalone and browser tools verify portable evidence without btc.fun’s backend.
- Negative cases cover tampering, omission, stale clock/proofs and unavailable data.
- Build Log preserves decision history and links claims to reproducible evidence.

## Task plan

- [`MN6` — Portable settlement evidence and independent reconstruction](../../modules/mining/tasks/MN6-verifiable-settlement-published-queue-an.md)
- [`WA6` — Proof Explorer with declared trust roots and negative cases](../../modules/web/tasks/WA6-proof-explorer-public-client-side-verifi.md)
- [`BL1` — Build Log from evidence and decision history](../../modules/docs/tasks/BL1-build-log-pipeline.md)
