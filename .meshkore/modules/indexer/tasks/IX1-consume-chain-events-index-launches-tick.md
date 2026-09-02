---
id: IX1
title: "Rebuildable transaction and Cell-transition indexing"
status: backlog
priority: high
owner: rjj
category: indexer
initiative: indexer-api
created: 2026-09-23
updated: 2026-09-23
---

Derive launch, ticket, epoch, claim, expiry, burn and redemption events from actual chain transactions/Cell transitions.

## Execution

- Phase: 2.
- Prerequisites: `TC1`, `MN3`, `V8`.

## Done when

- Rows include chain provenance, script version and provisional/final status.
- A fresh database reconstructs the reference launch from chain data and required public evidence.
- Indexer latency is measured separately from chain finality.
