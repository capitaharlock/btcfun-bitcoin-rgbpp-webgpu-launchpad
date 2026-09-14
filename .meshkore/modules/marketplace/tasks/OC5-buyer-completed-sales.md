---
id: OC5
title: "Sales completed by the buyer alone"
status: done
priority: high
owner: rjj
category: marketplace
initiative: onchain-tokens
created: 2026-09-24
updated: 2026-09-24
completed_at: 2026-09-24T12:30:00Z
commit_shas: [63f6b57, ceb9940, c64ad7c]
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

## Resolution

`lib/rgbpp/sale.ts` signs a listing with SIGHASH_SINGLE|ANYONECANPAY over the token cell's UTXO and the price, and completes a purchase for the buyer; a unit test verifies the seller's signature on the final transaction. Listings are shown only after their PSBT, signer, live cell and unspent seal check out. Browser tests cover a sale completed while the seller is away, cancellation, and tampered listings.
