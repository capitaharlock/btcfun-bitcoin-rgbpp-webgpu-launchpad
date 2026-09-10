---
id: OC6
title: "Ticket, mint and transfer over RGB++ in the app"
status: backlog
priority: critical
owner: rjj
category: web
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
---

The app builds and signs the ticket, mint and transfer transactions with the
RGB++ SDK, tracks each through Bitcoin confirmation and CKB settlement, and
reads balances from the chain instead of the local ledger.

## Done when

- Holdings show on-chain xUDT balances with provisional and settled states.
- A transfer to another Bitcoin address settles and appears in the recipient's app.
- The local signed ledger is removed rather than kept alongside.
