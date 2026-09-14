---
id: OC6
title: "Ticket, mint and transfer over RGB++ in the app"
status: done
priority: critical
owner: rjj
category: web
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [1df6a72, bebaab6, dbc157c, c6fabf7]
---

The app builds and signs the ticket, mint and transfer transactions with the
RGB++ SDK, tracks each through Bitcoin confirmation and CKB settlement, and
reads balances from the chain instead of the local ledger.

## Done when

- Holdings show on-chain xUDT balances with provisional and settled states.
- A transfer to another Bitcoin address settles and appears in the recipient's app.
- The local signed ledger is removed rather than kept alongside.

## Resolution

The app builds open, ticket, mint and transfer as plans (`lib/rgbpp/operations.ts`), signs the committing Bitcoin transaction, and hands the CKB side to the RGB++ queue; balances are the xUDT cells sealed to the wallet's outputs. The local signed ledger is removed. Funding never spends a seal, including one of an operation still landing.
