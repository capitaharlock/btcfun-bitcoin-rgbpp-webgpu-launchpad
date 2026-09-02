---
id: V3
title: "Current RGB++ SDK, wallet and authorization validation"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-23
---

Compare RGBPlusPlus/rgbpp-sdk and @ckb-ccc/rgbpp with pinned releases and actual deployment compatibility. The original utxostack SDK is archived. Select one wallet for the first demo.

## Execution

- Phase: 1.
- Prerequisites: `V1`, `V2`.

## Done when

- A real wallet completes the Bitcoin UTXO/CKB binding and transfer route with transaction IDs and proof dependencies.
- Document who signs each step, actual lock/type scripts, service dependencies and provisional/confirmed/anchored states.
- Capability matrix covers the required ticket/claim/redemption transaction shapes, not merely connection or PSBT signing.
- Assess leap/folding separately; only claim capabilities demonstrated by the spike.
