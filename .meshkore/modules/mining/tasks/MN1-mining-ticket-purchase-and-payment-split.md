---
id: MN1
title: "Authenticated tickets and segregated payment accounting"
status: done
priority: critical
owner: rjj
category: mining
initiative: mining-engine
created: 2026-09-23
updated: 2026-09-24
completed_at: 2026-09-24T13:30:00Z
commit_shas: [cba60d5, 07f0236]
---

Implement the adopted commitment/admission and ticket payment split. Pending ticket funds do not become withdrawable backing before corresponding obligations are resolved.

## Execution

- Phase: 2.
- Prerequisites: `TC3`, `PC3`, `PC6`.

## Done when

- Admission evidence, ticket uniqueness, price and all split balances are checkable on chain.
- Failed/zero-work/late tickets receive the adopted treatment; deposits are neither lost nor counted twice.
- Ticket issuance enforces the supported epoch/batch bounds.

## Resolution

The ticket pays 9,500 sats to the promoter and 500 sats (5 %) to the platform in one Bitcoin transaction, and the mint script refuses to arm a cell otherwise ([decision](../../../context/decisions/2026-09-24-platform-fee-per-ticket.md)). There are no pending ticket funds: the promoter is paid in the block the ticket confirms. `contracts/mint-core/src/lib.rs` (`pays_tickets`), `contracts/tests/src/mint/`, `apps/web/src/lib/rgbpp/operations.ts` (`planTicket`).
