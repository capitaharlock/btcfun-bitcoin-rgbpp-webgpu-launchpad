---
title: Guarantees and criteria
updated: 2026-09-25
status: draft
---

# Guarantees and criteria

What btc.fun promises each party, and where each promise is enforced. Written
independent of the chain: today every rule runs on Bitcoin testnet3 with RGB++
on CKB, but a port to a chain with native tokens (Solana, for instance) must
keep the same promises, and only the column "enforced by" should change. Each
row names today's mechanism so a port knows what it replaces.

## Principles

1. **Rules over operators.** Economic rules live in code that the chain runs,
   never in the platform's database. The platform may refuse to *list*; it can
   never change a balance, a reward or a price.
2. **One standard for every launch.** Creators choose identity and payout
   address, never economics. Tokens stay comparable and nobody can make one
   look scarce with a small number.
3. **Paid admission, open verification.** Launching costs a registration fee
   and needs the platform's certificate; anyone can check both.
4. **A transaction that commits funds must stay valid.** Nothing a mint or a
   transfer checks may depend on when it confirms (the stranded-cells lesson).
5. **No custody.** The platform never holds miners' or holders' funds; payments
   go straight to the promoter and the platform in the payer's transaction.
6. **Never overstate.** What is not verified is labelled unverified, in the
   code, the docs and the interface.

## Promises

| To | Promise | Enforced by (today) | A native-token chain would use |
|---|---|---|---|
| Miner | A ticket costs the same on every launch: 14,983 units of the fee asset | Mint script checks the ticket's outputs (`require_ticket`) | The mint program checks the payment instruction |
| Miner | The reward is exactly `10^8·clz²/2^k` for the best hash, priced at the ticket | Mint script recomputes work and amount | The mint program, same formula and vectors |
| Miner | Work starts the moment the ticket is sent, and is never lost to an activation | Challenge is the ticket's output; armed cell names it | Challenge derived from the payment's signature/slot |
| Miner | A mint, once signed, cannot become invalid while it waits | Pricing at the ticket's anchor; no height check in a mint | Same: no time-dependent check in the mint |
| Promoter | Every ticket pays the promoter's share directly, in the same transaction | Mint script checks the output to the promoter's script | Transfer in the same transaction, checked by the program |
| Promoter | Nobody can redirect the promoter's income | The promoter's script is in the token's terms | Promoter account in the launch's config account |
| Platform | Every ticket pays the platform's share | Platform script compiled into the mint script | Platform account constant in the program |
| Platform | Only admitted launches mint | Certificate key compiled into the mint script; checked at every miner's first arming | Program checks a platform signature, or a registry account the platform writes |
| Everyone | The token's identity commits to its name, symbol, description, image hash, opening height and promoter | Terms in the mint script's args; the xUDT owner is that script | Mint address derived from the same terms (PDA seeds) |
| Everyone | Any mint can be checked from the chains alone | Proof page recomputes commitment, work and amount | Same recomputation from the program's instruction data |
| Holder | Tokens are yours: only your key moves them | RGB++ seal to your Bitcoin output | Native token account owned by your key |
| Buyer | A sale completes only as the seller signed it, without anyone holding the goods | PSBT with the seller's signature over the exact outputs | Atomic swap instruction or escrow-free order program |

## What is not promised

- **No floor, no redemption, no reserve.** A token is worth what someone pays.
- **No income guarantee for a promoter.** Income is what miners choose to pay;
  the creator's page shows illustrative figures, labelled as such.
- **No endorsement.** Admission means the fee was paid and the launch met the
  platform's checks at that time; it is not investment advice.
- **The index is a convenience.** Losing it loses discovery, never ownership.

## Criteria for admitting a launch

Today: a paid registration committed to the exact terms, known to Bitcoin (in
the mempool or a block). No launch is admitted without one — the platform's own
included: the mint script refuses a certificate over no registration. The
certificate is the
place where further checks go — identity review, name collisions, prohibited
content — because it is signed before a launch can take its first ticket. Each
new criterion is a decision record and a line here.

## Costs by design

The registration fee (20,000 sats) and the platform's 11 % of each ticket are
the platform's income. On Bitcoin, RGB++ adds a paymaster payment when a miner
cell is created (7,000 sats) and a network fee per signature; a chain with
native tokens and cheap transactions would drop the paymaster and most of the
network cost, keeping the same shares.
