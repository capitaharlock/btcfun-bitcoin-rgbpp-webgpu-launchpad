---
id: indexer-api
title: "Rebuildable indexer and read API"
status: backlog
priority: high
oneliner: "Expose auditable projections with explicit provenance and confirmation states."
modules:
  - indexer
target: "Phase 2 \u2014 Demo; Phase 3 \u2014 Pilot discovery"
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [mining-engine, provable-trust, web-app]
---

# Rebuildable indexer and read API

## Why this exists

The UI needs separate scheduled, expired, issued and redeemable quantities. The indexer must not become authoritative for minting, liabilities or accepted Bitcoin time.

## Execution and gate

IX1, IX2 and IX4 are part of the first demo. Defer IX3 discovery until the pilot plan establishes what to measure.

Gate order and shared evidence: [roadmap](../../docs/roadmap.md).

## Done when

- A fresh database reconstructs the demo with chain provenance and documented evidence dependencies.
- Same-height hash replacements and dual-chain reorgs do not double count funds or claims.
- Metrics reconcile to canonical state and do not label supply as demand or addresses as humans.

## Task plan

- [`IX1` — Rebuildable transaction and Cell-transition indexing](../../modules/indexer/tasks/IX1-consume-chain-events-index-launches-tick.md)
- [`IX2` — Reconciled allowance, liabilities and reserve metrics](../../modules/indexer/tasks/IX2-derived-metrics-circulating-burned-floor.md)
- [`IX4` — Dual-chain reorg replay and reconciliation](../../modules/indexer/tasks/IX4-reorg-handling-idempotency-and-reconcili.md)
- [`IX3` — Minimal pilot discovery and measured activity feeds](../../modules/indexer/tasks/IX3-search-and-feeds.md)
