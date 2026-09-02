---
id: unified-marketplace
title: "Optional marketplace expansion"
status: backlog
priority: low
oneliner: "Add a market discovery and analytics surface only when actual usage justifies it."
modules:
  - marketplace
target: "Phase 5 \u2014 Evidence-led expansion"
created: 2026-09-23
updated: 2026-09-23
owner: rjj
related: [liquidity-integration, graduation-protocol, product-validation]
---

# Optional marketplace expansion

## Why this exists

A full marketplace adds integration and support scope before the launch/mining value proposition has been demonstrated. Keep it out of the first demo and pilot gates.

## Execution and gate

Await PV3 plus functioning reviewed liquidity/activation paths. The earlier minimal SDK and standalone verifier remain independent of this initiative.

Gate order and shared evidence: [roadmap](../../docs/roadmap.md).

## Done when

- Discovery unifies actual launches/markets without conflating liquidity and backing.
- P&L includes costs/refunds with explicit denomination; external consumers can query documented data.
- Expansion has a stated user need and does not change existing reserve rights.

## Task plan

- [`MK1` — Demand-justified launch and market discovery](../../modules/marketplace/tasks/MK1-unified-discovery-across-launches-and-ma.md)
- [`MK2` — Market portfolio and cost-basis analytics](../../modules/marketplace/tasks/MK2-market-pages-charts-search-portfolio-and.md)
- [`MK3` — Expanded public market API and SDK](../../modules/marketplace/tasks/MK3-public-api-sdk-activity-stream-liquidity.md)
