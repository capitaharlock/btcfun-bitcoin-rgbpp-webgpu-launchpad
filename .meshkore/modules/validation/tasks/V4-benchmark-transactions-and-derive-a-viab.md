---
id: V4
title: "Measure end-to-end cost and latency"
status: backlog
priority: high
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-24
---

Measure open, ticket, mint, transfer and sale on testnet and publish what each costs and how long it takes.

## Execution

- Phase: 1.
- Prerequisites: `OC8`, `V8`.

## Done when

- Separate Bitcoin fees, the ticket, seal outputs, paymaster fees and recoverable CKB capacity per operation.
- Publish byte counts, cycles and latency distributions with network and load assumptions and the confirmation policy.
- Record wallet prompts and failure/retry behaviour; test a fee-spike scenario.
