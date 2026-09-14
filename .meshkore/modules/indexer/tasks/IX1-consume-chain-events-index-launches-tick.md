---
id: IX1
title: "Rebuildable transaction and Cell-transition indexing"
status: backlog
priority: high
owner: rjj
category: indexer
initiative: indexer-api
created: 2026-09-23
updated: 2026-09-24
---

Derive launches, tickets, mints, transfers and sales from chain transactions and cell transitions, so the public index is a projection that can be rebuilt rather than a store of self-reported events.

## Execution

- Phase: 2.
- Prerequisites: `OC3`, `OC6`, `V8`.

## Done when

- Rows carry chain provenance, the mint script's code hash and provisional or final status.
- A fresh database reconstructs a reference launch — supply, tickets sold, promoter income — from chain data alone.
- Indexer latency is measured separately from chain finality; supply is not labelled demand and cells are not labelled people.
