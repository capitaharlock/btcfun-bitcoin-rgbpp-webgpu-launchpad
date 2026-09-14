---
id: PC7
title: "Property, differential and fuzz checks for the mint rules"
status: backlog
priority: high
owner: rjj
category: protocol
initiative: emission-core
created: 2026-09-23
updated: 2026-09-24
---

Exercise the reward function and the mint script's transitions beyond the fixed vectors and hand-written cases.

## Execution

- Phase: 2.
- Prerequisites: `OC2`.

## Done when

- Properties hold for every input: the reward never overflows, is monotone in `clz` and non-increasing in `k`, and is zero from the terminal halving.
- The Rust and TypeScript reward and challenge agree on generated inputs, not only on `contracts/vectors/reward.json`.
- Generated transactions against the script — wrong amounts, cells, anchors, payments and witnesses — are refused; unauthorized minting of the xUDT is impossible.
- CI publishes reproducible seeds and bounded fuzz runs.
