---
id: DC4
title: "Transfer, ownership and the order-book circuits"
status: done
priority: high
owner: rjj
category: docs
initiative: public-docs
created: 2026-09-24
updated: 2026-09-24
completed_at: 2026-09-24T15:10:00Z
---

How ownership is declared (a CKB cell sealed to a Bitcoin UTXO; spending the
UTXO is the only way to move it), how a transfer is authorised, and the order
book: an ask pre-signed with `SIGHASH_SINGLE | ANYONECANPAY` that the buyer
completes alone, and a bid as a signed intention a holder accepts and the
bidder completes. Flowcharts and transaction anatomy for transfer and sale.

## Done when

- Ownership, transfer, ask and bid each have a diagram that agrees with
  `PROTOCOL.md` §5 and the order-book decision.

## Resolution

Diagrams on `src/docs/pages/ownership` (a token cell sealed to a Bitcoin output and what the RGB++ lock checks), `transfers` (flow and transaction anatomy from `planTransfer`) and `market` (ask flow, purchase anatomy from `lib/rgbpp/sale.ts` with the SINGLE|ANYONECANPAY pair highlighted, and the bid flow as a signed intention met by an ordinary listing), consistent with `PROTOCOL.md` §5 and decision `2026-09-24-peer-to-peer-order-book`.
