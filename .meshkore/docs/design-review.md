---
title: September 23 design review
category: docs
tags: [economics, architecture, evidence]
updated: 2026-09-23
owner: rjj
status: draft
related: [economic-validation, validate-architecture]
---

# Design review — findings driving the revised plan

This is a specification review, not a contract audit or proof of product demand.
The numerical examples below were checked with high-precision arithmetic during
the review. E1–E5 must turn them into a maintained executable model and validate a
replacement. No production economics has been adopted by this document.

## Economic findings

1. **Dilution and reserve extraction.** Let 100 tickets priced at 10 create R=850
   backing and S=1000 tokens. A later sole ticket adds 8.5 backing and receives
   an epoch budget of 500. R/S moves from 0.85 to 858.5/1500 ≈ 0.572333; the new
   entrant can redeem 500 tokens for ≈286.1667, before fees, against a ticket cost
   of 10. Lower scheduled emission does not imply lower tokens per ticket.
2. **Presence is not demand intensity.** One valid participant and many valid
   participants can exhaust the same epoch budget. A regularly participating bot
   defeats supply-as-community-demand claims.
3. **Cap candidate.** For R,S>0, (R+ΔR)/(S+m)≥R/S implies m≤ΔR×S/R. This is
   a pure-issuance condition, not a complete mechanism. Genesis, zero balances,
   timing, pending deposits, rounding and withholding require explicit rules.
4. **Capital recovery is not guaranteed.** The old 85/10/5 scenario assigns only
   85% of ticket receipts to aggregate backing. Work-weighted allocation can
   distribute that backing unevenly, and external asset prices/fees add exposure.
5. **Discrete schedule.** Summing M·ln(2)/1008·2^(−n/1008) for integer n≥0 with
   M=21M yields ≈21,007,221.1106, not 21M. A cumulative schedule with epoch
   differences avoids treating a continuous density as a discrete allowance.
6. **Terminal precision.** Finite atoms and finite arithmetic require dust,
   rounding and end-of-emission policies. Exact real-valued floor invariance and
   forever-positive residual minting are not implementation requirements.
7. **Graduation.** Addresses/UTXOs are not unique people. Market funding cannot
   spend backing already owed to holders. A pool also needs an explicit token
   source and LP ownership/withdrawal policy.

## Architecture findings

- An operator-published queue permits recomputation but does not establish its
  completeness or ensure operator availability. Admission/closure/recovery must
  be protocol mechanisms, with explicit data-availability assumptions.
- Using an owned UTXO in a hash and proving authority by consuming its single-use
  seal are separate obligations. Challenge derivation needs domain separation,
  owner binding, admission timing and replay rules.
- RGB++ folding, leap and ordinary transfer have distinct requirements; market
  graduation is not automatically a leap. A fast CKB confirmation is not the same
  as Bitcoin finality.
- Bitcoin proofs require an accepted clock, freshness/chain-selection policy and
  a response to reorgs, including a different hash at the same height. Rebuilding
  an indexer cannot reverse an already accepted CKB transition.
- xUDT authority and extensions need a concrete design. Circulating supply from
  an indexer is insufficient to enforce redemption liabilities, especially with
  unclaimed allocations and voluntary burns.
- Evaluate full batch cycles/bytes, proof overhead, occupied capacity and per-launch
  contention. Measuring one candidate hash does not establish scalability.

## Product findings

Start with community distribution, not general project fundraising. Keep technical
and commercial gates separate. Browser mining has an existing precedent in BRO;
validate the differentiated complete launch/verification experience. Model only
fees actually captured by btc.fun, and distinguish testnet interest from paid demand.

## Primary sources checked during the review

- [Original RGB++ SDK archive notice](https://github.com/utxostack/rgbpp-sdk): archived,
  directs users to the successor. Do not freeze the old dependency in V3.
- [RGBPlusPlus SDK](https://github.com/RGBPlusPlus/rgbpp-sdk): successor candidate;
  pin and test actual releases, not the fact that a fork exists.
- [CCC RGB++ SDK preview and workflow](https://talk.nervos.org/t/cn-en-rgb-sdk-ckb-ccc-rgbpp-new-rgb-sdk-preview-ckb-ccc-rgbpp-looking-for-early-adopters/9937):
  another candidate; the documented unlock flow waits for BTC confirmations/SPV.
- [RGB++ light paper](https://github.com/utxostack/RGBPlusPlus-design/blob/main/docs/light-paper-en.md):
  binding, folding and shared-state/intents rationale; not proof of this app's implementation.
- [RGB++ components](https://www.rgbppfans.com/docs/components): lock verification
  uses Bitcoin SPV and commitment validation.
- [xUDT RFC](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0052-extensible-udt/0052-extensible-udt.md):
  extensions, owner-mode paths and reproducible deployments.
- [BRO](https://bro.charms.dev/): browser-mined token precedent, not evidence of
  btc.fun demand or the viability of its reserve model.

These sources inform research tasks. Their presence is not a claim that current
wallet/SDK/venue compatibility has been verified for btc.fun.
