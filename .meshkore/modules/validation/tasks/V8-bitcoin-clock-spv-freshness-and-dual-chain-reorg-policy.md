---
id: V8
title: "Confirmation policy and dual-chain reorg treatment"
status: backlog
priority: critical
owner: rjj
category: validation
initiative: validate-architecture
created: 2026-09-23
updated: 2026-09-24
---

The halving clock is settled: a ticket's anchor, bounded by its SPV-proven confirming height (`PROTOCOL.md` §4.1, §6.1). What remains is the finality policy around it.

## Execution

- Phase: 1.
- Prerequisites: `OC1`.

## Done when

- Specify the confirmation depth the interface waits for before showing a mint, transfer or sale as final, and what it shows meanwhile.
- Exercise same-height Bitcoin hash replacement and CKB reorgs, including a CKB transaction already committed by a Bitcoin transaction on a replaced branch.
- Publish residual finality assumptions and the user-visible status model.
