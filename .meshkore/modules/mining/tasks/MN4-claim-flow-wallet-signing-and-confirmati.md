---
id: MN4
title: "Claim signing and explicit two-chain confirmation states"
status: backlog
priority: high
owner: rjj
category: mining
initiative: mining-engine
created: 2026-09-23
updated: 2026-09-23
---

Wire claim/signing for the first wallet and present provisional, CKB-confirmed and Bitcoin-anchored states correctly.

## Execution

- Phase: 2.
- Prerequisites: `MN3`, `V3`, `V8`.

## Done when

- Follow a ticket through claim or refund with actual transaction IDs and appropriate explorer links.
- Unclaimed allocations remain included in reserve liabilities according to the adopted model.
- Handle wallet rejection, expiry, stale transactions and reorg status without duplicating claims.
