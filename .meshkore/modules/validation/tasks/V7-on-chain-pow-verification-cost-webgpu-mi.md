---
id: V7
title: "PoW verification and browser feasibility measurements"
status: done
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [ccf317c, 93cfb38, b6e6afe, 1299b37]
---

Benchmark SHA256d and Eaglesong candidate evaluation in CKB-VM and a throwaway WebGPU/WASM miner with the intended challenge encoding.

## Execution

- Phase: 1.
- Prerequisites: `V1`, `E5`, `SH3`.

## Done when

- Browser and contract accept the same known work vectors and reject modified/replayed challenges.
- Record cycles per candidate and realistic device hashrates, responsiveness and energy/thermal observations.
- Select or reject a hash/weight candidate from measurements and SH3; distinguish hash evaluation cost from full transaction cost.

## Resolution

SHA-256d over a 40-byte preimage is selected. Browser and script accept the same vectors (`contracts/vectors/reward.json`, reproduced by `contracts/mint-core` and `apps/web/src/domain/protocol/standard.ts`); work against another ticket is refused in `contracts/tests/src/mint/`. A whole mint transaction costs 312,518 cycles (OC2), which includes the hash evaluation. Browser hashrate is measured on real runs on CPU workers and WebGPU (`apps/web/src/domain/mining`, LB2, MN8). Eaglesong was not pursued.
