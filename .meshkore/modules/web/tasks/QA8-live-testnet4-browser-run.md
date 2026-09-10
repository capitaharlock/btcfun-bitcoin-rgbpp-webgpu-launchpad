---
id: QA8
title: "Live testnet4 run through the browser"
status: done
priority: high
owner: rjj
category: code
initiative: browser-qa
created: 2026-09-23
updated: 2026-09-23
---

The whole product with real satoshis in two browsers: restore the funded wallet, buy a ticket, mine, claim, send, sell one token to a second person, settle, create a token and mine it once the chain opens it.

## Done when

- Every transaction the browser broadcasts is fetched back from mempool.space and checked.
- `npm run test:browser:live` runs it headed; opt-in because it spends.
