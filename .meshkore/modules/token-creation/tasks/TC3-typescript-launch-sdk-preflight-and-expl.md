---
id: TC3
title: "Minimal launch SDK and preflight"
status: backlog
priority: high
owner: rjj
category: token-creation
initiative: token-launch
created: 2026-09-23
updated: 2026-09-24
---

Package the builders `scripts/rgbpp/live.mjs` already uses into a minimal SDK a third party can call, with preflight diagnostics for the selected network.

## Execution

- Phase: 2.
- Prerequisites: `TC1`, `TC2`, `V3`.

## Done when

- A third-party script creates a launch and runs open, ticket, mint and transfer without the btc.fun web app.
- Preflight reports network, fees, CKB capacity and paymaster cost, and the confirmation stages to expect.
- Returns the transaction IDs and evidence the proof page needs.
