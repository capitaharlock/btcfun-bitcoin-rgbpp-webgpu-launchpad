# Test results

btc.fun's tokens are RGB++ xUDT cells on CKB, minted under one standard by a
script on chain. This document accounts for how that is tested — the script in
CKB-VM, the rules in two languages, and every user journey in a real browser,
the path that works and every path that must be refused — what the testing
found, and the latest numbers.

| Layer | Tests | Result |
|---|---:|---|
| Mint script in CKB-VM, against the deployed xUDT and RGB++ lock (`contracts/tests`) | 26 | all passing |
| Standard rules in Rust (`contracts/mint-core`) | 8 | all passing |
| Unit — reward, challenge, plans, commitment, sales, bids, order book, diagrams, docs, verifier, launches, payments, mining | 136 | all passing |
| Browser — simulated Bitcoin, RGB++ and CKB (`ui`) | 70 | all passing |
| Browser — phone layout and docs (`mobile`) | 27 | all passing |
| Live — testnet3 and CKB testnet: open, ticket, mint, transfer, sale | 6 transactions | all settled; one early failure fixed (below) |

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
- **The paymaster's lock travels with the transaction.** The first live
  opening failed on CKB: the queue appends the paymaster's cell but not the
  dependency its secp256k1 lock needs, and every dependency had been sent as
  `code` even when it was a group. Plans that need the paymaster now carry its
  lock group with its own type, and the simulated queue refuses one that does not.
- **The script's release build avoids LTO and size optimisation**, both of which
  produced layouts CKB-VM rejects as writes to executable pages.

## Live testnet run

`npm run rgbpp:live -- launch | open | ticket | mine | mint | transfer | list | buy | status`
walks one launch through the real services, one step at a time while Bitcoin
confirms and the RGB++ queue lands each CKB transaction.

<!-- live:start -->
Run on 2026-09-24 with `npm run rgbpp:live`, against the public RGB++ services,
Bitcoin testnet3 and the mint script deployed on CKB testnet
(`contracts/deployments/testnet.json`, code hash `0x43771432…`). Every
transaction was built by the app's own `lib/rgbpp` code; the runner only adds
keys read from disk. Launch `LIVEQA`, token id `0x351ffc76…`, promoter Bob.

| Step | Bitcoin testnet3 | CKB testnet | What it shows |
|---|---|---|---|
| Open (failed) | [04e221a88845e7…](https://mempool.space/testnet/tx/04e221a8884585a468c0e7fbfd9c9b82759671a5909bb615531c86653380f050) | — | The queue could not verify the CKB side: the paymaster's secp256k1 lock had no dependency. Fixed in the planner; the Bitcoin side cost one seal and fee. |
| Open | [9141a9278512…](https://mempool.space/testnet/tx/9141a9278512fddba6f3f16b9f5916b768766e58e619407991bd4953359c4b6f) | [0xe22268aefa…](https://testnet.explorer.nervos.org/transaction/0xe22268aefa985706cd055d2a06e8061b162329f3b25d6b21d1cb6e6643c7ed3d) | Idle miner cell sealed to Alice, capacity from the paymaster. |
| Ticket | [db5a7e23d96b…](https://mempool.space/testnet/tx/db5a7e23d96b5a2de8bbf1eb40394e3b6b625777558ade8cb68fc3a572246726) | [0xee9bcedbb5…](https://testnet.explorer.nervos.org/transaction/0xee9bcedbb52f08b591a30c7ec22135ec1761ac45ea3323f7371f0e46f4dbf1d1) | 9,500 sats to the promoter (Bob) and 500 to the platform in the same transaction; the cell armed. |
| Mint | [c12627c30a3e…](https://mempool.space/testnet/tx/c12627c30a3e7a19b993374bb8928b555486f1a99745f99ff9a8c99a4210daca) | [0x91b62e8551…](https://testnet.explorer.nervos.org/transaction/0x91b62e8551c2693224cc46c9245f52191cbf2953e40589bdc4350917be912320) | A 21-bit hash found in 3 s on one CPU core; 441 tokens (44,100,000,000 atoms), exactly `10^8 × 21²`, accepted by the mint script. |
| Transfer | [c4f208ccdb06…](https://mempool.space/testnet/tx/c4f208ccdb06ba98e1c3c2312c56a5ea470836b6363d6f1f90542170913d1745) | [0x46317010bf…](https://testnet.explorer.nervos.org/transaction/0x46317010bfee3f61b3e2bb7c466f12a0d70b8b19c8070ce4ff7b40dc5986c02b) | 110.25 tokens to Bob; 330.75 stay with Alice. |
| Sale | [f06f4fd25ba1…](https://mempool.space/testnet/tx/f06f4fd25ba1ad8bf45f33e6669cb745e6ab2359ff10826c088b92b546ec4589) | [0xb16cc6569c…](https://testnet.explorer.nervos.org/transaction/0xb16cc6569c950a232db14960d227528cb9d2ced4d6c73d9721eb9a9cce9c15d0) | Bob signed a listing of his 110.25 tokens for 20,000 sats and did nothing else; Alice completed and broadcast it alone. Output 0 pays Bob 20,000 sats, output 2 seals the tokens to Alice. |

Final state: Alice holds 441 tokens in two cells, Bob holds 20,000 sats more and
no tokens — every step reconciles on both chains. Invalid mints were not
broadcast live: once a Bitcoin transaction spends a seal, a CKB transaction the
script refuses strands that cell for good, so refusals are established in
CKB-VM against the deployed binaries (26 tests) rather than by burning cells.
<!-- live:end -->

## Latest browser run

Generated from the Playwright report; experience notes recorded by the tests
appear under the file that observed them.

<!-- results:start -->

_Generated from the last run on 2026-09-24 13:12 UTC — 97 tests: 97 passed, 0 failed, 0 skipped._

#### `ui/activity.spec.ts` — 2/2

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | activity › an announcement reaches another browser through the index | ui | 53.4 s |
| ✅ | activity › an announcement whose terms were altered in the index is dropped | ui | 19.0 s |

> A launch announced in one browser appears in another's catalogue after the index poll.

#### `ui/bids.spec.ts` — 2/2

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | bids › a holder sells to a bid and the bidder completes it; both sides settle in one transaction | ui | 87.5 s |
| ✅ | bids › a bid its author withdraws leaves the book for everyone | ui | 55.9 s |

> The bidder signed a bid that locked nothing; the holder met it with a listing; the bidder's one transaction settled both sides.
>
> Withdrawing a bid is one signed event; every visitor's book drops it on the next read.

#### `ui/create-wizard.spec.ts` — 6/6

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | create wizard › announces a launch whose id is its token's, and lists it as opening soon | ui | 12.1 s |
| ✅ | create wizard › never asks for supply, price, difficulty or schedule | ui | 28.6 s |
| ✅ | create wizard › keeps the draft when the visitor leaves to get a wallet | ui | 7.6 s |
| ✅ | create wizard › refuses what is not a launch › a malformed symbol, name or sentence keeps Continue disabled with the reason in place | ui | 4.8 s |
| ✅ | create wizard › refuses what is not a launch › an income address on another network is refused | ui | 11.0 s |
| ✅ | create wizard › refuses what is not a launch › opening now is refused: a launch must be announced before it opens | ui | 7.0 s |

> Announcing takes three steps and no economic choices; the card flips to mining when the block arrives.
>
> Leaving the wizard for the wallet and coming back lands on the last step with everything kept.

#### `ui/docs.spec.ts` — 28/28

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | docs › the footer link opens the docs | ui | 5.0 s |
| ✅ | docs › overview renders with its diagrams | ui | 4.6 s |
| ✅ | docs › tokenomics renders with its diagrams | ui | 6.3 s |
| ✅ | docs › mint renders with its diagrams | ui | 28.6 s |
| ✅ | docs › ownership renders with its diagrams | ui | 7.6 s |
| ✅ | docs › transfers renders with its diagrams | ui | 5.3 s |
| ✅ | docs › market renders with its diagrams | ui | 9.3 s |
| ✅ | docs › verification renders with its diagrams | ui | 4.0 s |
| ✅ | docs › testnet renders with its diagrams | ui | 5.9 s |
| ✅ | docs › the pages that explain a circuit carry its diagrams | ui | 7.0 s |
| ✅ | docs › every diagram label meets WCAG AA contrast against the shape behind it | ui | 20.0 s |
| ✅ | docs › an unknown page says so and links back | ui | 4.2 s |
| ✅ | docs › the technical layer is folded until asked for | ui | 5.8 s |
| ✅ | docs › docs fit the screen and navigate from the contents | ui | 12.2 s |
| ✅ | docs › the footer link opens the docs | mobile | 5.0 s |
| ✅ | docs › overview renders with its diagrams | mobile | 4.0 s |
| ✅ | docs › tokenomics renders with its diagrams | mobile | 6.6 s |
| ✅ | docs › mint renders with its diagrams | mobile | 2.7 s |
| ✅ | docs › ownership renders with its diagrams | mobile | 1.7 s |
| ✅ | docs › transfers renders with its diagrams | mobile | 2.8 s |
| ✅ | docs › market renders with its diagrams | mobile | 2.5 s |
| ✅ | docs › verification renders with its diagrams | mobile | 2.2 s |
| ✅ | docs › testnet renders with its diagrams | mobile | 1.9 s |
| ✅ | docs › the pages that explain a circuit carry its diagrams | mobile | 1.5 s |
| ✅ | docs › every diagram label meets WCAG AA contrast against the shape behind it | mobile | 1.2 s |
| ✅ | docs › an unknown page says so and links back | mobile | 1.3 s |
| ✅ | docs › the technical layer is folded until asked for | mobile | 0.7 s |
| ✅ | docs › docs fit the screen and navigate from the contents | mobile | 2.0 s |

#### `ui/holdings.spec.ts` — 3/3

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | holdings › a transfer reaches another wallet, which sees it with no action of its own | ui | 117.0 s |
| ✅ | holdings › an empty wallet is told how to get tokens | ui | 2.8 s |
| ✅ | holdings › refuses what cannot be sent › more than the balance, a non-address and a mainnet address keep Send disabled | ui | 38.1 s |

> The recipient's balance appears on their own holdings page after one block, without any action from them.

#### `ui/layout.spec.ts` — 20/20

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | layout › / has no horizontal scroll | ui | 4.0 s |
| ✅ | layout › /create has no horizontal scroll | ui | 1.4 s |
| ✅ | layout › /market has no horizontal scroll | ui | 2.3 s |
| ✅ | layout › /activity has no horizontal scroll | ui | 4.2 s |
| ✅ | layout › /holdings has no horizontal scroll | ui | 16.7 s |
| ✅ | layout › /wallet has no horizontal scroll | ui | 5.4 s |
| ✅ | layout › /lab has no horizontal scroll | ui | 7.1 s |
| ✅ | layout › /proof has no horizontal scroll | ui | 3.1 s |
| ✅ | layout › the top bar fits a phone with a wallet connected | ui | 8.5 s |
| ✅ | layout › the four sections stay reachable | ui | 5.4 s |
| ✅ | layout › / has no horizontal scroll | mobile | 5.3 s |
| ✅ | layout › /create has no horizontal scroll | mobile | 1.5 s |
| ✅ | layout › /market has no horizontal scroll | mobile | 2.0 s |
| ✅ | layout › /activity has no horizontal scroll | mobile | 1.1 s |
| ✅ | layout › /holdings has no horizontal scroll | mobile | 1.7 s |
| ✅ | layout › /wallet has no horizontal scroll | mobile | 1.8 s |
| ✅ | layout › /lab has no horizontal scroll | mobile | 1.0 s |
| ✅ | layout › /proof has no horizontal scroll | mobile | 1.5 s |
| ✅ | layout › the top bar fits a phone with a wallet connected | mobile | 2.6 s |
| ✅ | layout › the four sections stay reachable | mobile | 1.3 s |

#### `ui/market.spec.ts` — 4/4

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | market › a buyer completes a listing while the seller is away; both sides settle in one transaction | ui | 71.8 s |
| ✅ | market › a listing the seller cancels disappears, and cannot be bought | ui | 77.8 s |
| ✅ | market › a listing whose PSBT was tampered with is never shown | ui | 23.9 s |
| ✅ | market › with nothing to sell, the sell panel says how to get tokens | ui | 2.4 s |

> The seller closed their browser after listing; the buyer's single transaction paid them and moved the tokens.
>
> A listing altered in the index fails its signature and PSBT checks and is not offered to buyers.

#### `ui/mining.spec.ts` — 6/6

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | mining › a first-time miner goes from nothing to a real balance | ui | 58.8 s |
| ✅ | mining › minting again adds to the same balance, and the best hash survives a reload | ui | 72.4 s |
| ✅ | mining › rails › without a wallet, the page explains that tokens belong to an address | ui | 24.3 s |
| ✅ | mining › rails › before the opening block there is nothing to buy | ui | 7.7 s |
| ✅ | mining › rails › an empty wallet is told why nothing was sent | ui | 5.3 s |
| ✅ | mining › rails › a queue that has not settled keeps the ticket landing, not failed | ui | 7.6 s |

> First tokens take four clicks and three blocks: open, ticket, mine, mint — each step says what it is waiting for.
>
> A reload in the middle of mining keeps the best hash for the ticket; nothing has to be ground twice.

#### `ui/navigation.spec.ts` — 13/13

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | navigation › renders / without errors | ui | 3.4 s |
| ✅ | navigation › renders /create without errors | ui | 3.8 s |
| ✅ | navigation › renders /market without errors | ui | 4.2 s |
| ✅ | navigation › renders /activity without errors | ui | 1.8 s |
| ✅ | navigation › renders /wallet without errors | ui | 6.8 s |
| ✅ | navigation › renders /lab without errors | ui | 3.9 s |
| ✅ | navigation › renders /proof without errors | ui | 2.7 s |
| ✅ | navigation › the four main sections are in the header, in order | ui | 9.5 s |
| ✅ | navigation › the chain tip shown in the header is the provider's | ui | 5.3 s |
| ✅ | navigation › an empty catalogue says so and points at creation, with no invented launches | ui | 2.6 s |
| ✅ | navigation › an unknown launch says so instead of rendering an empty page | ui | 4.2 s |
| ✅ | navigation › an unknown route falls back to the front page | ui | 2.8 s |
| ✅ | navigation › a provider outage degrades the header, not the app | ui | 4.8 s |

> With nothing announced the front page shows no sample launches, only the way to create the first.
>
> With the Bitcoin provider down every page still renders; the header waits for the tip.

#### `ui/proof.spec.ts` — 3/3

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | proof › a real mint passes every check, recomputed from chain data | ui | 58.5 s |
| ✅ | proof › a ticket is not a mint, and says why | ui | 22.4 s |
| ✅ | proof › a malformed txid keeps Verify disabled | ui | 2.8 s |

> The proof page recomputes commitment, ticket, work and amount; every line says what it checked.

#### `ui/time.spec.ts` — 3/3

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | time › a day, a week and day 21: the rate halves by the week, shown before buying | ui | 38.1 s |
| ✅ | time › a ticket keeps the rate it was bought at, even when minted after a halving | ui | 34.9 s |
| ✅ | time › after the terminal halving a launch is spent and says so | ui | 8.3 s |

> The rate halves exactly at each 1,008-block boundary and every screen agrees on it.
>
> Buying a ticket just before a halving locks the higher rate; the mint after the halving is accepted at that rate.

#### `ui/wallet.spec.ts` — 7/7

| | Test | Project | Time |
|---|---|---|---:|
| ✅ | wallet › a demo key yields a testnet address and an empty balance | ui | 4.6 s |
| ✅ | wallet › funds arriving on chain show up without a reload | ui | 7.4 s |
| ✅ | wallet › restoring the same secret twice yields the same wallet | ui | 13.5 s |
| ✅ | wallet › the revealed secret round-trips to the same address | ui | 5.9 s |
| ✅ | wallet › disconnecting forgets the wallet on reload | ui | 6.6 s |
| ✅ | wallet › refuses bad secrets › too short keeps Restore disabled | ui | 3.1 s |
| ✅ | wallet › refuses bad secrets › 64 characters that are not hex are rejected in words a person understands | ui | 3.8 s |

> A malformed secret is refused with a readable message and no wallet is created.

<!-- results:end -->
