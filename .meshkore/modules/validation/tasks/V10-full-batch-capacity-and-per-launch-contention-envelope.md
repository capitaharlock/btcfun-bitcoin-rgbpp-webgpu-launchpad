---
id: V10
title: "Full batch capacity and per-launch contention envelope"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-23
---

Measure whole-epoch settlement at increasing participant counts (for example 1, 10, 100, 1000 until limits). Include scripts, proofs, outputs and competing redemptions.

## Execution

- Phase: 1.
- Prerequisites: `V4`, `V5`, `V9`.

## Done when

- Publish maximum safe bytes/cycles/capacity and observed contention, with headroom and reproducible inputs.
- Choose a supported batch bound, overflow/admission policy and epoch duration from measured evidence.
- If chunking is needed, specify closure and atomic liability accounting before promising scalability.
- Architecture gate records go/no-go for costs, finality, wallet support and unilateral recovery.
