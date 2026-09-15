---
title: "The market is a peer-to-peer order book, with no pool and no market maker"
updated: 2026-09-24
status: stable
---

# Decision

The btc.fun market is an order book between users. Liquidity comes only from
their orders:

```text
ASK   a holder signs a listing — one whole cell for a price (PROTOCOL.md §5.1);
      any buyer completes it alone, in one Bitcoin transaction
BID   a buyer signs an intention — this many atoms for this many sats;
      a holder meets it with a listing for exactly those terms,
      and the bidder completes that listing
```

There is no liquidity pool, no automated market maker, no market maker run by
the platform and no platform custody of tokens or sats at any step.

A bid is a signed intention, not escrow. It locks nothing, and it becomes a
trade only when the bidder completes the listing a holder signed for it. The
interface says so where a bid is placed and where it is accepted. Withdrawing a
bid is a signed event by its author.

A promoter may independently take their token to an external AMM such as
UTXOSwap. That is the promoter's choice and their pool; the platform does not
create, fund, list or operate one.

# Why

- **What the tokens are.** A btc.fun token is a support holding in a
  community — closer to a bond than to a trading instrument. The market exists
  so holders can hand them on to people who want them, not to be a venue for
  speculation.
- **A pool lets a few actors move the price.** A bonding curve or constant
  product pool prices every trade against a formula, so whoever trades first or
  largest sets the price for everyone, and early sellers can drain the pool of
  the side later holders depend on. An order book only ever executes at a price
  two people each signed.
- **No custody is possible, so none is pretended.** RGB++ sales are one Bitcoin
  transaction whose commitment names the seller's cell; the buyer must sign it
  after the seller chose that cell. A resting bid that fills by itself would need
  someone to hold the bidder's sats. Bids as signed intentions keep the
  guarantee that payment and delivery happen together or not at all.
- **The index stays an index.** Bids and withdrawals are signed events the
  index stores after checking the signature, like every other event. Status —
  open, accepted, filled, withdrawn — is derived by each client from those
  events and the chain; the server decides nothing (`.meshkore/docs/hosting.md`).

# Consequences

- Every order is all-or-nothing. A listing sells one whole cell; a holder
  meeting a bid for part of a balance first sets that amount aside in a cell of
  its own.
- A listing signed for a bid is still an open listing. Someone other than the
  bidder may buy it first; the bid is then open again.
- Trades and the last price come only from Bitcoin transactions that spend a
  listed output first and pay its seller the listed price. A report of a sale is
  a pointer to where to look, never the evidence.
- Liquidity can be thin, and the book says so rather than filling the gap with
  platform capital.
