---
id: MK4
title: "Signed offer book and the atomicity boundary"
status: done
priority: medium
owner: rjj
category: marketplace
initiative: testnet-spike
created: 2026-09-23
updated: 2026-09-23
---
Offers signed over launch, amount, price, payment address and a block-height expiry; fills as real payments committing to the offer id; settlement as a signed transfer record. Deliberately stops at the atomicity boundary and documents what crossing it requires. Research input to `MK1` and a concrete requirement for `V3`.

## Done when

- A tampered, replayed or foreign-signed offer is rejected, with tests.
- Offer status ranks by which party is currently exposed.
- The page states that swaps are not atomic and why, and never says \"trade\".
- The offer format commits to everything a single-use seal would, except the seal.
