---
title: Product
updated: 2026-09-24
status: draft
---

# Product

**Initial audience:** existing Bitcoin/CKB communities interested in verifiable
community-token distribution and a browser mining experience. Serious project
fundraising is outside the first product.

**Loop:** `TICKET → MINE → MINT → (TRANSFER | SELL) → VERIFY`. A ticket is a
Bitcoin payment of 5,000 sats to the launch's promoter; its output is the mining
challenge. The miner sees live what the best hash is worth and mints exactly
that into a Bitcoin output they control. A ticket has real cost and does not
guarantee a result worth it.

**Creator choices:** identity only — symbol, name, one sentence, an accent
colour — plus the Bitcoin address that receives ticket income and the opening
height. Every economic parameter is the standard's (`PROTOCOL.md` §4), so a
creator cannot make a token look scarce by picking a small number, and supply,
tickets sold and current halving are comparable between launches.

**Value proposition:** tokens under one public rule set, enforced on CKB,
owned on Bitcoin through RGB++, visible to any RGB++-aware wallet, and
checkable by anyone from both chains. Browser mining itself already exists (for
example BRO); the complete lifecycle must earn its differentiation in pilots.

**No reserve, no floor, no redemption.** Ticket income is the promoter's
revenue, paid inside the ticket transaction and checked by the mint script. A
token is worth what someone will pay for it; the interface states this wherever
a ticket is bought.

**Revenue:** ticket income to the promoter. A platform fee on tickets is an open
decision (`PV3`); version 1 has none. Measure operating costs, including CKB
capacity for miner cells and who pays it. External DEX fees are not btc.fun
revenue without an explicit capture mechanism.

**Sales:** peer-to-peer, completed by the buyer alone. The seller pre-signs its
listed UTXO and price with `SIGHASH_SINGLE | ANYONECANPAY`; payment and delivery
are one Bitcoin transaction.

**Validation:** recruit a small number of existing communities and measure first
cycle completion, repeat participation, understanding of costs and of the
halving, hardware and reward concentration, and contribution margin after
infrastructure, transaction subsidies and support. Set numeric pass/fail
thresholds before each pilot; count addresses as addresses, not people. Testnet
can test usability but cannot establish willingness to pay real money.

**Scope discipline:** no automatic graduation, custom AMM, extra wallet
integrations or funding/vesting platform until evidence justifies them.
