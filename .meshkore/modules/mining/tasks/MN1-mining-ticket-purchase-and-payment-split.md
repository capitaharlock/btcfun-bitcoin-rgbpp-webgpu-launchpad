---
id: MN1
title: "Authenticated tickets and segregated payment accounting"
status: backlog
priority: critical
owner: rjj
category: mining
initiative: mining-engine
created: 2026-09-23
updated: 2026-09-23
---

Implement the adopted commitment/admission and ticket payment split. Pending ticket funds do not become withdrawable backing before corresponding obligations are resolved.

## Execution

- Phase: 2.
- Prerequisites: `TC3`, `PC3`, `PC6`.

## Done when

- Admission evidence, ticket uniqueness, price and all split balances are checkable on chain.
- Failed/zero-work/late tickets receive the adopted treatment; deposits are neither lost nor counted twice.
- Ticket issuance enforces the supported epoch/batch bounds.
