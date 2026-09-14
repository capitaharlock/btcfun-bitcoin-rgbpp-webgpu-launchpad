---
id: IX4
title: "Dual-chain reorg replay and reconciliation"
status: backlog
priority: critical
owner: rjj
category: indexer
initiative: indexer-api
created: 2026-09-23
updated: 2026-09-24
---

Make indexing idempotent and roll back or reconcile against the confirmation policy adopted in V8.

## Execution

- Phase: 2.
- Prerequisites: `IX1`, `V8`.

## Done when

- Exercise same-height hash replacement, shallow and deep Bitcoin branch changes and CKB reorg fixtures.
- No ticket, mint, transfer or sale is counted twice after replay.
- Indexer repair is clearly distinguished from on-chain outcomes that rebuilding a database cannot reverse.
