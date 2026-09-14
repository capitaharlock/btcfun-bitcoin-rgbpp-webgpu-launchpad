---
title: Overview
updated: 2026-09-24
status: draft
---

# btc.fun — overview

A community token launchpad where every token follows one standard. A person
buys a ticket on Bitcoin, mines against it in the browser, and mints what the
result is worth, in that moment, into a Bitcoin output they control. Tokens are
RGB++ xUDT cells on Nervos CKB bound to Bitcoin UTXOs; a CKB script enforces the
mint rule, and a proof page recomputes any mint from both chains.

**Status: testnet implementation in progress.** The economic model is decided
by the standard tokenomics (`PROTOCOL.md` §4, decision of 2026-09-24): fixed
ticket price paid to the promoter, instant per-ticket mint, weekly halving from
the launch's opening, no supply cap, no reserve. The mint script is deployed on
CKB testnet and the client builds tickets, mints, transfers and sales over
RGB++. The live end-to-end run over the RGB++ path is pending funds; nothing has
been reviewed for real money.

**Two objectives:** demonstrate deep, reproducible command of Bitcoin / RGB++ /
CKB / CKB-VM, and discover whether communities will repeatedly use the product.
Technical success and commercial success have separate acceptance gates.

**Active work:** the `onchain-tokens` initiative (`OC1`–`OC8`). The earlier
`economic-validation` series is superseded as a gate by the adopted standard.
Roadmap and gate order: `.meshkore/docs/roadmap.md`.

**First demo:** a stranger opens a launch, buys a ticket, mines, mints, sees the
balance in the app and an RGB++-aware explorer, transfers part, lists part, and
a third person buys it without the seller online. Invalid mints fail on-chain.
Automatic graduation remains deferred.

`PROTOCOL.md` is the canonical behavioral specification. Read
`idea-evolution.md` for history, including why earlier guarantees and the epoch
and reserve model were withdrawn.
