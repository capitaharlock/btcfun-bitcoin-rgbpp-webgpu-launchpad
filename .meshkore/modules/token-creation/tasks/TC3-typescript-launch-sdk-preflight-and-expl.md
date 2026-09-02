---
id: TC3
title: "Minimal launch SDK and preflight"
status: backlog
priority: high
owner: rjj
category: token-creation
initiative: token-launch
created: 2026-09-23
updated: 2026-09-23
---

Provide the minimal unsigned transaction builders and preflight diagnostics for the selected wallet/network.

## Execution

- Phase: 2.
- Prerequisites: `TC1`, `TC2`, `V3`.

## Done when

- A third-party script creates a launch end to end without the btc.fun web app.
- Preflight reports reserve denomination, fees/capacity, signed authorization and finality stages.
- Return transaction IDs and evidence required by the verifier.
