---
title: Glossary
updated: 2026-09-24
status: draft
---

# Glossary

| Term | Meaning |
|---|---|
| Standard | The one rule set every launch follows (`PROTOCOL.md` §4); compiled into the mint script, never a launch parameter |
| Launch | A token identity (symbol, name, sentence, accent), a promoter address and an opening height `h0`; its terms are the mint script's args |
| Promoter | The Bitcoin address that receives every ticket payment of a launch |
| Ticket | A Bitcoin transaction paying 5,000 sats to the promoter and arming a miner cell; not a guaranteed return |
| Challenge | `sha256(ticket_txid ‖ ticket_vout)` of the armed cell's Bitcoin output; cannot exist before the ticket is paid |
| Anchor | The ticket's height, declared by the wallet and accepted only between `h0` and the ticket's SPV-proven confirming block, at most 144 blocks before it; fixes the ticket's rate |
| Halving | Every 1008 Bitcoin blocks counted from `h0`; `k` is the number elapsed at the anchor |
| `clz` | Leading zero bits of `sha256d(challenge ‖ nonce)`; at least 16 to mint |
| Reward | `floor(10^8 × clz² / 2^k)` atoms, 8 decimals; zero from `k = 43` for every possible hash |
| Miner cell | A per-miner, per-launch CKB cell under an RGB++ lock and the mint script type; `idle` or `armed` |
| Mint script | The Rust CKB type script enforcing open, ticket, mint and close transitions; one code hash for every launch |
| Owner mode | xUDT permission to mint; here granted by an input whose type hash is the mint script's hash |
| Mint | Spending the armed cell's UTXO: the cell returns to idle carrying the nonce and the balance grows by exactly the reward; may not re-arm |
| RGB++ binding | A CKB cell bound to a Bitcoin UTXO; the spending Bitcoin transaction commits to the CKB transaction in `OP_RETURN` |
| Single-use seal | State authorization tied to consuming a particular UTXO once; a hash reference alone is insufficient |
| Queue service / paymaster | The RGB++ service that completes the CKB side with an SPV proof, and adds CKB capacity for a BTC fee; replaceable by anyone |
| Listing | A seller's `SIGHASH_SINGLE \| ANYONECANPAY` signature over its token UTXO and price; the buyer completes the sale alone |
| Leap | Explicit migration of asset control/binding across chains; not a synonym for market activation |
| Accepted Bitcoin clock | Height admitted by the RGB++ SPV proof under the protocol's confirmation policy |
| Proof Explorer | Page recomputing a mint from the two chains, stating what each check establishes and its trust roots |
| Graduation | Deferred market activation |
| Unique address | Distinct address, not a distinct human or Sybil-resistant identity |
| Withdrawn terms | Epoch, emission ceiling, pari-mutuel allocation, redeemable reserve, redemption ratio and backing-limited issuance belong to the superseded model; see `idea-evolution.md` |
