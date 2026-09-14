# Test results

btc.fun's tokens are RGB++ xUDT cells on CKB, minted under one standard by a
script on chain. This document accounts for how that is tested — the script in
CKB-VM, the rules in two languages, and every user journey in a real browser,
the path that works and every path that must be refused — what the testing
found, and the latest numbers.

| Layer | Tests | Result |
|---|---:|---|
| Mint script in CKB-VM, against the deployed xUDT and RGB++ lock (`contracts/tests`) | 24 | all passing |
| Standard rules in Rust (`contracts/mint-core`) | 8 | all passing |
| Unit — reward, challenge, plans, commitment, sales, verifier, launches, payments, mining | 79 | all passing |
| Browser — simulated Bitcoin, RGB++ and CKB (`ui`) | 56 | all passing |
| Browser — phone layout (`mobile`) | 9 | all passing |
| Live — testnet3 and CKB testnet | — | pending: the end-to-end wallet has no testnet3 funds yet |

```bash
cd contracts
cargo build -p btcfun-mint --release --target riscv64imac-unknown-none-elf
cargo test                    # mint-core rules + the script in CKB-VM

cd apps/web
npm test                      # unit
npm run test:browser          # browser, simulated chains + phone layout
npm run test:browser:headed   # the same, on screen
npm run rgbpp:live -- status  # live testnet run, step by step (needs the funded wallet)
npm run test:report           # refresh the generated section below
```

## How it is tested

**The script, in the VM that runs it.** `contracts/tests` executes the mint
script in CKB-VM with `ckb-testtool`, next to the xUDT and RGB++ config fetched
from their deployed cells on CKB testnet and installed under the same type-id
scripts, so the identities the script trusts are the real ones. The RGB++ lock
is the upstream build with only its SPV lookup mocked. Each test builds the
Bitcoin transaction and the CKB transaction it commits to, as a wallet would,
and asserts the script's decision by error code, so a refusal for the wrong
reason does not pass as a refusal.

**One set of vectors, two implementations.** `contracts/vectors/reward.json`
is generated independently in Python with exact integers. The Rust rules and
the TypeScript client both reproduce it, so the amount the page shows while
mining is the amount the script accepts.

**Every journey in a real browser, over simulated chains.** The Playwright
suite replaces three services with simulators the tests steer: the Bitcoin
provider (block height is the clock, so a test lives through a day, a week or
day 21 in seconds), the RGB++ service with its queue and paymaster, and a CKB
node. The simulated queue settles an operation once its Bitcoin transaction
has a block and refuses what the chain would: a commitment that does not match,
seals left unspent, dead inputs, cells below their occupied capacity, and every
rule of the mint script, restated in the simulator as an independent oracle
rather than imported from the app. A client that built the wrong transaction
fails here instead of agreeing with itself. The suite runs against the
production build; two-person journeys use separate browser contexts; any
request the simulators do not recognise, and any uncaught page error, fails the
test.

## What was covered

| Area | Works as intended | Refused as it must be |
|---|---|---|
| Mint script (CKB-VM) | open an idle miner cell; a paid ticket arms it; a valid hash mints exactly the reward; a mint adds to an existing balance; the reward is priced at the ticket's anchor however late the mint confirms; two tickets for two launches of one promoter | armed without a ticket; a cell not bound to Bitcoin; unpaid, underpaid or misdirected ticket; a ticket that mints; one payment arming two cells; anchor too old, in the future or before opening; weak hash; amount one atom high or low; work against another ticket; an idle cell minting; a mint that re-arms; closing that mints; a miner cell under another lock; a forged Bitcoin transaction behind a sibling cell; the xUDT minting with no miner cell |
| Navigation and layout | every route renders; four sections in order; chain tip shown; empty catalogue says so; no horizontal scroll on desktop or phone | unknown launch; unknown route; provider outage |
| Wallet | demo key; funds appear; restore is deterministic; secret round-trips; disconnect forgets | short secret; non-hex secret in plain words |
| Create a token | three steps announce a launch whose id is its token's; defaults the income address to the creator's; opens when the chain reaches it; draft survives a detour to the wallet | malformed symbol, name or sentence; an income address on another network; opening now; no economic parameter is ever asked |
| Mining | an empty wallet to a real balance: open through the paymaster, ticket paid to the promoter, mining before the ticket settles, minting after it; a second mint adds to the balance; the best hash survives a reload | no wallet; before opening; empty wallet (nothing broadcast); a stalled queue shows the ticket landing, not failed |
| Time | day 0, 1, 7 and 21: the rate halves exactly at each 1,008 blocks, on every screen; a ticket bought before a halving mints at its rate after it; the launch is spent after the terminal halving | — |
| Holdings | a transfer reaches a second browser's wallet, which sees it without any action; change stays with the sender | more than the balance; not an address; a mainnet address; zero |
| Market | a buyer completes a listing while the seller is away: one transaction pays the seller and moves the tokens; cancellation voids a listing | a listing whose PSBT was altered is never shown; an own listing cannot be bought |
| Proof | a real mint passes commitment, ticket, disarm, work and amount, recomputed from chain data | a ticket is not a mint and says why; a malformed txid |
| Activity | an announcement reaches another browser through the index | an announcement altered in the index is dropped |

## What testing changed in the product

Each was found by a test or by building the test that would catch it, and each
is now covered.

- **A signed mint can never be stranded.** Once a Bitcoin transaction spends
  sealed UTXOs, the CKB transaction it commits to is the only way those cells
  move again. Pricing a mint at the height it confirms would have made a mint
  that confirmed after a halving invalid forever, balance included. The rate is
  now fixed by the ticket's anchor, the mint reads no height or witness, and a
  mint that re-arms is refused.
- **The script reads the witness the RGB++ lock verified.** Cells sealed to one
  UTXO share a lock group whose first witness is the verified one; reading the
  miner cell's own witness would have let a forged transaction pay for a
  ticket. A test forges exactly that and is refused.
- **One payment buys one ticket.** A promoter with two launches could have been
  paid once for two armed cells; the script now counts every armed cell of that
  promoter in the transaction.
- **Cells are sized with their data.** Plans had counted an output without its
  data, which would have produced token cells below their occupied capacity.
  Every plan is now checked against the occupied size, data included.
- **Funding never spends a seal.** Until its CKB side settles, a seal looks like
  a plain 546-sat output; spending it as funding would strand the cells it is
  about to carry. Funding now excludes those outputs and every output of an
  operation still landing.
- **The nonce travels in committed data.** The RGB++ queue rewrites the
  witnesses of RGB++ inputs, so the nonce lives in the new miner cell's data,
  which the Bitcoin commitment covers.
- **Purchases and cancellations are confirmed on screen.** A listing leaves the
  table the moment it is bought or cancelled; the market now keeps a notice of
  what was done and its transaction.
- **The script's release build avoids LTO and size optimisation**, both of which
  produced layouts CKB-VM rejects as writes to executable pages.

## Live testnet run

Pending. The mint script is deployed on CKB testnet
(`contracts/deployments/testnet.json`) and the end-to-end wallet holds CKB
testnet funds; it needs Bitcoin testnet3 funds at
`tb1q93pwzegduvqq2mahaxy6vq0ydnz5yqv9kz7qc4`. Then
`npm run rgbpp:live -- launch | open | ticket | mine | mint | transfer | status`
walks one launch through the real services and records every transaction here.

<!-- live:start -->
<!-- live:end -->

## Latest browser run

Generated from the Playwright report; experience notes recorded by the tests
appear under the file that observed them.

<!-- results:start -->

_Generated from the last run on 2026-09-24 12:09 UTC — 65 tests: 65 passed, 0 failed, 0 skipped._

#### `ui/activity.spec.ts` — 2/2

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | activity › an announcement reaches another browser through the index | ui | 25.8 s |
| ✅ | activity › an announcement whose terms were altered in the index is dropped | ui | 16.9 s |

> A launch announced in one browser appears in another's catalogue after the index poll.

#### `ui/create-wizard.spec.ts` — 6/6

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | create wizard › announces a launch whose id is its token's, and lists it as opening soon | ui | 8.4 s |
| ✅ | create wizard › never asks for supply, price, difficulty or schedule | ui | 8.4 s |
| ✅ | create wizard › keeps the draft when the visitor leaves to get a wallet | ui | 11.3 s |
| ✅ | create wizard › refuses what is not a launch › a malformed symbol, name or sentence keeps Continue disabled with the reason in place | ui | 5.5 s |
| ✅ | create wizard › refuses what is not a launch › an income address on another network is refused | ui | 4.7 s |
| ✅ | create wizard › refuses what is not a launch › opening now is refused: a launch must be announced before it opens | ui | 4.0 s |

> Announcing takes three steps and no economic choices; the card flips to mining when the block arrives.
>
> Leaving the wizard for the wallet and coming back lands on the last step with everything kept.

#### `ui/holdings.spec.ts` — 3/3

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | holdings › a transfer reaches another wallet, which sees it with no action of its own | ui | 70.9 s |
| ✅ | holdings › an empty wallet is told how to get tokens | ui | 1.5 s |
| ✅ | holdings › refuses what cannot be sent › more than the balance, a non-address and a mainnet address keep Send disabled | ui | 15.8 s |

> The recipient's balance appears on their own holdings page after one block, without any action from them.

#### `ui/layout.spec.ts` — 18/18

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | layout › / has no horizontal scroll | ui | 2.6 s |
| ✅ | layout › /create has no horizontal scroll | ui | 1.9 s |
| ✅ | layout › /market has no horizontal scroll | ui | 1.6 s |
| ✅ | layout › /activity has no horizontal scroll | ui | 2.2 s |
| ✅ | layout › /holdings has no horizontal scroll | ui | 2.2 s |
| ✅ | layout › /wallet has no horizontal scroll | ui | 6.1 s |
| ✅ | layout › /lab has no horizontal scroll | ui | 5.7 s |
| ✅ | layout › /proof has no horizontal scroll | ui | 2.9 s |
| ✅ | layout › the four sections stay reachable | ui | 2.8 s |
| ✅ | layout › / has no horizontal scroll | mobile | 3.7 s |
| ✅ | layout › /create has no horizontal scroll | mobile | 2.7 s |
| ✅ | layout › /market has no horizontal scroll | mobile | 2.3 s |
| ✅ | layout › /activity has no horizontal scroll | mobile | 2.6 s |
| ✅ | layout › /holdings has no horizontal scroll | mobile | 3.2 s |
| ✅ | layout › /wallet has no horizontal scroll | mobile | 2.1 s |
| ✅ | layout › /lab has no horizontal scroll | mobile | 1.7 s |
| ✅ | layout › /proof has no horizontal scroll | mobile | 1.2 s |
| ✅ | layout › the four sections stay reachable | mobile | 1.5 s |

#### `ui/market.spec.ts` — 4/4

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | market › a buyer completes a listing while the seller is away; both sides settle in one transaction | ui | 37.4 s |
| ✅ | market › a listing the seller cancels disappears, and cannot be bought | ui | 45.3 s |
| ✅ | market › a listing whose PSBT was tampered with is never shown | ui | 5.8 s |
| ✅ | market › with nothing to sell, the sell panel says how to get tokens | ui | 1.4 s |

> The seller closed their browser after listing; the buyer's single transaction paid them and moved the tokens.
>
> A listing altered in the index fails its signature and PSBT checks and is not offered to buyers.

#### `ui/mining.spec.ts` — 6/6

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | mining › a first-time miner goes from nothing to a real balance | ui | 31.1 s |
| ✅ | mining › minting again adds to the same balance, and the best hash survives a reload | ui | 45.4 s |
| ✅ | mining › rails › without a wallet, the page explains that tokens belong to an address | ui | 16.7 s |
| ✅ | mining › rails › before the opening block there is nothing to buy | ui | 1.5 s |
| ✅ | mining › rails › an empty wallet is told why nothing was sent | ui | 1.8 s |
| ✅ | mining › rails › a queue that has not settled keeps the ticket landing, not failed | ui | 2.3 s |

> First tokens take four clicks and three blocks: open, ticket, mine, mint — each step says what it is waiting for.
>
> A reload in the middle of mining keeps the best hash for the ticket; nothing has to be ground twice.

#### `ui/navigation.spec.ts` — 13/13

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | navigation › renders / without errors | ui | 1.9 s |
| ✅ | navigation › renders /create without errors | ui | 2.0 s |
| ✅ | navigation › renders /market without errors | ui | 1.2 s |
| ✅ | navigation › renders /activity without errors | ui | 2.6 s |
| ✅ | navigation › renders /wallet without errors | ui | 1.7 s |
| ✅ | navigation › renders /lab without errors | ui | 4.2 s |
| ✅ | navigation › renders /proof without errors | ui | 4.2 s |
| ✅ | navigation › the four main sections are in the header, in order | ui | 5.6 s |
| ✅ | navigation › the chain tip shown in the header is the provider's | ui | 2.5 s |
| ✅ | navigation › an empty catalogue says so and points at creation, with no invented launches | ui | 1.7 s |
| ✅ | navigation › an unknown launch says so instead of rendering an empty page | ui | 1.4 s |
| ✅ | navigation › an unknown route falls back to the front page | ui | 1.7 s |
| ✅ | navigation › a provider outage degrades the header, not the app | ui | 4.4 s |

> With nothing announced the front page shows no sample launches, only the way to create the first.
>
> With the Bitcoin provider down every page still renders; the header waits for the tip.

#### `ui/proof.spec.ts` — 3/3

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | proof › a real mint passes every check, recomputed from chain data | ui | 29.2 s |
| ✅ | proof › a ticket is not a mint, and says why | ui | 24.4 s |
| ✅ | proof › a malformed txid keeps Verify disabled | ui | 5.9 s |

> The proof page recomputes commitment, ticket, work and amount; every line says what it checked.

#### `ui/time.spec.ts` — 3/3

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | time › a day, a week and day 21: the rate halves by the week, shown before buying | ui | 21.3 s |
| ✅ | time › a ticket keeps the rate it was bought at, even when minted after a halving | ui | 23.6 s |
| ✅ | time › after the terminal halving a launch is spent and says so | ui | 8.8 s |

> The rate halves exactly at each 1,008-block boundary and every screen agrees on it.
>
> Buying a ticket just before a halving locks the higher rate; the mint after the halving is accepted at that rate.

#### `ui/wallet.spec.ts` — 7/7

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | wallet › a demo key yields a testnet address and an empty balance | ui | 6.9 s |
| ✅ | wallet › funds arriving on chain show up without a reload | ui | 6.2 s |
| ✅ | wallet › restoring the same secret twice yields the same wallet | ui | 12.1 s |
| ✅ | wallet › the revealed secret round-trips to the same address | ui | 7.6 s |
| ✅ | wallet › disconnecting forgets the wallet on reload | ui | 5.3 s |
| ✅ | wallet › refuses bad secrets › too short keeps Restore disabled | ui | 2.1 s |
| ✅ | wallet › refuses bad secrets › 64 characters that are not hex are rejected in words a person understands | ui | 2.9 s |

> A malformed secret is refused with a readable message and no wallet is created.

<!-- results:end -->
