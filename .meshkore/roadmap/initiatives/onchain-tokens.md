---
id: onchain-tokens
title: "Real tokens on RGB++ and CKB"
status: active
priority: critical
oneliner: "Ticket, mine, mint into your own Bitcoin UTXO, transfer and sell — every token a real RGB++ xUDT under one standard rule set."
modules:
  - validation
  - protocol
  - web
  - marketplace
target: "Testnet demo — a stranger mints, transfers and buys without the seller online"
created: 2026-09-24
updated: 2026-09-24
owner: rjj
related: [browser-qa, testnet-spike, validate-architecture]
---

# Real tokens on RGB++ and CKB

## Why this exists

The prototype proved the screens and the Bitcoin ticket, but its tokens lived
in a signed ledger inside each browser: no wallet could see them and a sale left
the buyer exposed. The standard tokenomics
([decision](../../context/decisions/2026-09-24-standard-tokenomics-and-instant-mint.md),
`PROTOCOL.md` §4) makes a mint a single miner's result, which is what lets it be
settled on-chain the moment it happens. This initiative puts the tokens on
RGB++ and CKB and removes everything the old epoch and reserve model needed.

## Approach

- One CKB type script — the mint script — enforces the whole rule set. It reads
  the Bitcoin transaction and SPV-proven height that the RGB++ lock has already
  verified, so it adds the economics without re-implementing the binding.
- The token is a standard xUDT whose owner mode requires the mint script, so it
  is visible to RGB++-aware wallets and explorers and cannot be minted any other
  way.
- The client uses the current RGB++ SDK on CCC. The reward is computed in the
  browser only to show it live; both implementations pass the same vectors.
- Sales are one Bitcoin transaction: the seller pre-signs its listed UTXO with
  `SIGHASH_SINGLE | ANYONECANPAY`, the buyer completes and broadcasts alone.

## Done when

- A mint on testnet produces an xUDT balance that an RGB++ explorer shows under
  the launch's type hash, for the amount the app displayed while mining.
- Invalid mints — weak hash, reused ticket, inflated amount, unpaid ticket — are
  rejected on-chain, with the rejection recorded in `.meshkore/docs/testing/results.md`.
- A transfer between two wallets and a sale completed by a buyer while the
  seller is offline are confirmed on-chain.
- Costs, cycles and capacity are measured and published.

## Task plan

- [`OC1` — RGB++ toolchain, networks and a first xUDT between two wallets](../../modules/validation/tasks/OC1-rgbpp-toolchain-networks-and-first-xudt.md)
- [`OC2` — The mint script](../../modules/protocol/tasks/OC2-mint-type-script.md)
- [`OC3` — Deploy the mint script and open miner cells](../../modules/protocol/tasks/OC3-deploy-and-miner-cells.md)
- [`OC4` — Standard reward in the client, live while mining](../../modules/web/tasks/OC4-standard-reward-in-the-client.md)
- [`OC5` — Sales completed by the buyer alone](../../modules/marketplace/tasks/OC5-buyer-completed-sales.md)
- [`OC6` — Ticket, mint and transfer over RGB++ in the app](../../modules/web/tasks/OC6-ticket-mint-transfer-over-rgbpp.md)
- [`OC7` — Retire the epoch and reserve model from the product](../../modules/web/tasks/OC7-retire-epoch-and-reserve-model.md)
- [`OC8` — Live end-to-end run with three wallets](../../modules/web/tasks/OC8-live-run-three-wallets.md)
