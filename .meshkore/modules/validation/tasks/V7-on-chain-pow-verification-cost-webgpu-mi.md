---
id: V7
title: "PoW verification and browser feasibility measurements"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-23
---

Benchmark SHA256d and Eaglesong candidate evaluation in CKB-VM and a throwaway WebGPU/WASM miner with the intended challenge encoding.

## Execution

- Phase: 1.
- Prerequisites: `V1`, `E5`, `SH3`.

## Done when

- Browser and contract accept the same known work vectors and reject modified/replayed challenges.
- Record cycles per candidate and realistic device hashrates, responsiveness and energy/thermal observations.
- Select or reject a hash/weight candidate from measurements and SH3; distinguish hash evaluation cost from full transaction cost.
