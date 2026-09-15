---
id: MN7
title: "Operator shutdown, permissionless completion and exit"
status: done
priority: critical
owner: rjj
category: mining
initiative: mining-engine
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T13:30:00Z
---

Integrate V9’s recovery route and exercise it with the official services disabled.

## Execution

- Phase: 2.
- Prerequisites: `MN3`, `MN4`, `MN5`, `MN6`.

## Done when

- Another client settles or executes the specified bounded refund/exit using independently available data.
- Withheld submissions, expired windows and partially attempted batches resolve under explicit rules.
- No administrator signature is needed; all fees, delay and availability assumptions are documented.
- Publish a reproducible recovery scenario for the first demo.

## Resolution

Nothing in the mint depends on btc.fun being online. The rules are an immutable script on CKB (unspendable deployment cell), tokens are sealed to the holder's own UTXOs, and every operation is built client-side against the public RGB++ services; `apps/web/scripts/rgbpp/live.mjs` runs the whole life of a token with no btc.fun server. The index Worker only helps discovery. The remaining dependency is the public RGB++ queue and SPV service, which any party can run from the open-source RGB++ stack.
