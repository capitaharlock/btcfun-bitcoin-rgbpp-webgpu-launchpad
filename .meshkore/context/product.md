---
title: Product
updated: 2026-09-23
status: draft
---

# Product

**Initial audience:** existing Bitcoin/CKB communities interested in verifiable
community-token distribution and a browser mining experience. Serious project
fundraising is outside the first product: a mostly redeemable reserve is not
capital available to finance the creator's work.

**Candidate loop:** `COMMIT TICKET → MINE → SUBMIT → SETTLE → VERIFY → REDEEM`.
Exact admission and challenge timing are Phase 0/1 decisions, not UI assumptions.
Tokens are allocated through a proof-of-work weighted mechanism; buying a ticket
has real cost and does not guarantee a profit or recovery of the ticket price.

**Value proposition:** community launches with public rules, transparent reserve
accounting, and evidence users can independently verify. Browser mining itself
already exists (for example BRO); the complete launch and verification lifecycle
must earn its differentiation in pilots.

**Reserve:** denominated in one explicitly named CKB-side asset for the demo.
A redemption quote is in that asset, not a guarantee in BTC, fiat, or purchasing
power. A monotonically nondecreasing redemption ratio remains a design objective
pending the economic gate. Reserve funds never finance protocol expenses or
market liquidity. Fees, creator escrow and occupied Cell capacity are separate.

**Revenue hypothesis:** a disclosed ticket fee. The earlier 85/10/5 split is a
simulation input, not a committed parameter. Model creator escrow on expiry,
refunds, operator failure and unsuccessful launches before accepting tickets.
External DEX fees are not btc.fun revenue without an explicit capture mechanism.

**Validation:** recruit a small number of existing communities and measure first
cycle completion, repeat participation, understanding of costs/redemption,
hardware and reward concentration, and contribution margin after infrastructure,
transaction subsidies and support. Set numeric pass/fail thresholds before each
pilot; count addresses as addresses, not people. Testnet can test usability but
cannot establish willingness to pay real money.

**Scope discipline:** no marketplace, extra wallet integrations, funding/vesting
platform, or automatic graduation until evidence justifies them. Early UX
experiments may run alongside protocol work, without presenting simulated results
as real chain guarantees.
