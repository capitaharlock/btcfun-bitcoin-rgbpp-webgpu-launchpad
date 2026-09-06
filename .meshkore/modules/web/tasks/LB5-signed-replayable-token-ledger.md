---
id: LB5
title: "Signed, replayable token ledger"
status: done
priority: high
owner: rjj
category: web
initiative: testnet-spike
created: 2026-09-23
updated: 2026-09-23
---
Hash-chained records signed by the wallet's secp256k1 key: claims bound to a ticket txid, an epoch's Bitcoin block hash and the author's identity, and transfers between identities. `replay` is the only producer of state, including inside `append`. Amounts come from the §4.3 backing-limited allocation candidate. Direct input to `E3` and `PC`-series enforcement.

## Done when

- A claim's challenge is derived from its own fields, never stored alongside them.
- Forged work, forged amounts, reused tickets, foreign signatures, broken chain
  links and over-spends are all rejected, with tests.
- The backing ratio never falls under the allocation rule, with a test.
- The absence of settlement is stated in the module and on every screen using it.
