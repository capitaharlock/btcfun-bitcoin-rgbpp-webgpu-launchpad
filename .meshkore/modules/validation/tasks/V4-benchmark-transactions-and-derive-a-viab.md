---
id: V4
title: "Measure end-to-end cost, latency and epoch candidates"
status: backlog
priority: high
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-23
---

Measure the full admission → work submission → settlement → claim → redemption route. Use results to propose epoch lengths and a viable ticket price range.

## Execution

- Phase: 1.
- Prerequisites: `V3`, `V6`, `V7`, `V8`, `V9`.

## Done when

- Separate Bitcoin/CKB fees, output dust, recoverable locked Cell capacity, service subsidies and spendable reserve.
- Publish byte counts and latency distributions with network/load assumptions and confirmation policy.
- Record wallet prompts and failure/retry behavior; test a fee-spike scenario.
- Recommend epoch candidates consistent with admission/challenge/finality rules; V10 validates their batch envelope.
