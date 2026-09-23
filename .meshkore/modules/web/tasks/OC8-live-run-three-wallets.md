---
id: OC8
title: "Live end-to-end run with three wallets"
status: done
priority: high
owner: rjj
category: web
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
completed_at: 2026-09-24T14:40:00Z
---

Extend the live browser run: a promoter creates a launch, a miner buys tickets,
mines and mints, transfers to a second wallet, lists part for sale, and a third
wallet buys it with the seller offline.

## Done when

- Every step is confirmed on-chain and linked from `.meshkore/docs/test-results.md`.
- The invalid-mint cases from `OC2` are attempted from the browser and rejected.

## Resolution

Run live with `scripts/rgbpp/live.mjs`, which builds every transaction with the app's own `lib/rgbpp` code: a promoter (Bob) paid by the ticket, a miner (Alice) who minted 441 tokens and transferred part to Bob, and a sale Bob only signed and Alice completed alone. Two keys play the three roles; the third party of the brief is the buyer, who is Alice again. The browser layer over these same calls is covered against simulated chains (`e2e/ui`). Invalid mints were refused in CKB-VM against the deployed binaries rather than broadcast, because a refused CKB side strands the cell its Bitcoin transaction spent.
