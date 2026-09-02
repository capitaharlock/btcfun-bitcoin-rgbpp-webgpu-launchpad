---
id: IX4
title: "Dual-chain reorg replay and reconciliation"
status: backlog
priority: critical
owner: rjj
category: indexer
initiative: indexer-api
created: 2026-09-23
updated: 2026-09-23
---

Implement idempotent processing and rollback/reconciliation against the adopted protocol finality policy.

## Execution

- Phase: 2.
- Prerequisites: `IX1`, `IX2`, `V8`.

## Done when

- Exercise same-height hash replacement, shallow/deep branch changes and CKB reorg fixtures.
- No double-counted allocation, reserve debit or ticket remains after replay.
- Clearly distinguish indexer repair from protocol outcomes that cannot be reversed by rebuilding a database.
