---
id: MN6
title: "Portable settlement evidence and independent reconstruction"
status: backlog
priority: critical
owner: rjj
category: mining
initiative: provable-trust
created: 2026-09-23
updated: 2026-09-23
---

Publish portable epoch evidence and a standalone reconstruction/verifier tool. Include the canonical admitted set and closure evidence, not just an operator-selected queue.

## Execution

- Phase: 2.
- Prerequisites: `MN3`, `V9`.

## Done when

- An independent tool derives the economic transition, accepted membership and outputs from the evidence.
- Canonical unsigned transaction content is reproducible; signatures, funding inputs and allowed construction variation are documented.
- Omitted, altered, stale or unavailable evidence fails or reports an explicit inconclusive result.
- A third party can obtain required data after the official API is disabled.
