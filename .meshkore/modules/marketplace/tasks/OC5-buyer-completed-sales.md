---
id: OC5
title: "Sales completed by the buyer alone"
status: backlog
priority: high
owner: rjj
category: marketplace
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
---

A seller isolates an amount in its own UTXO and signs a listing with
`SIGHASH_SINGLE | ANYONECANPAY`; a buyer completes the RGB++ transaction and
broadcasts it with no action from the seller (`PROTOCOL.md` §5.1).

## Done when

- A listing can be cancelled by spending the listed UTXO, and the index stops
  showing it.
- A buyer's completion is confirmed on-chain while the seller's browser is closed.
- Tampering with price, recipient or amount produces a transaction the network
  or the RGB++ lock rejects.
