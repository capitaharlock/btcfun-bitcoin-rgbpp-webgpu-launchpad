---
title: Stack
updated: 2026-09-25
status: draft
---

# Stack — choices and remaining obligations

| Layer | Choice | Evidence held / still required |
|---|---|---|
| Issuance clock | Bitcoin height; halving every 1008 blocks from the launch's `h0`, rate fixed at the ticket's anchor | Anchor checked against the SPV-proven confirmation within 144 blocks. Confirmation policy and reorg behavior still open (`V8`) |
| Bitcoin network | testnet3, the only test network | The public RGB++ services verify testnet3 and testnet4 has no SPV client on CKB, so payments, tickets and tokens share testnet3. The earliest ticket experiments ran on testnet4 |
| Ownership | Bitcoin UTXOs through the RGB++ lock | Commitment implemented in the client and pinned by test to the RGB++ SDK and lock |
| Token | xUDT, owner mode by input type, owner = mint script hash | 8 decimals for every launch; metadata hashed into the mint script args |
| Contracts | Rust `no_std`, `ckb-std`, `rgbpp-core`, CKB-VM/RISC-V | 36 CKB-VM tests with `ckb-testtool`; cycles measured per whole transaction; version with paid cells and dissolving first mints deployed on CKB testnet 2026-09-25 (`contracts/deployments/testnet.json`) |
| Ticket and fees | One payment per round: 14,983 sats (7,000 paymaster when the round creates its cell, 11 % platform, rest promoter); arming and mint pay only the network, at `max(3, fastest)` sat/vB | Split enforced by the mint script and pinned by shared Rust/TS vectors; fees sized by the signing rule. Decision `2026-09-25-one-payment-per-round` |
| btc.fun witness | The first CKB witness past the inputs carries the creating ticket (arming) or the nonce (first mint) | Assumes the RGB++ queue replaces only sealed inputs' placeholder witnesses: matches the simulator, **unverified on the live queue until the testnet run** |
| Math | Exact integers; `floor(10^8 × clz² / 2^k)` as a shift | Rust and TypeScript pass the same vectors (`contracts/vectors/reward.json`) |
| PoW | SHA-256d over a 40-byte preimage (`sha256(txid‖vout)` ‖ nonce) | Hardware concentration still to be measured in pilots |
| Miner | WebGPU with CPU worker fallback | Every GPU candidate re-hashed on the CPU before use |
| CKB client | CCC (`@ckb-ccc/core`), one client behind a configurable endpoint | — |
| Settlement service | RGB++ queue service and its paymaster | Completes the CKB side for a BTC fee; replaceable by anyone with an SPV proof |
| Wallet | App wallet: WebAuthn PRF → BIP39 → BIP84 | Other wallets undecided |
| Client | TypeScript, React, Vite | 65 browser tests over simulated Bitcoin, RGB++ and CKB |
| Index | One Cloudflare Worker over D1 | Must be redeployed to carry listing payloads |

The original `utxostack/rgbpp-sdk` repository is archived and points to its
successor. Pin tested versions and record them; do not assume a preview package
is production-ready. Testnet network support must be verified across the
wallet, SDK, SPV service and deployed scripts as one system. Sources are
recorded in `.meshkore/docs/design-review.md`.

## Test wallets (Bitcoin testnet3)

Every address below is ours and derives from one secret: the BIP39 mnemonic in
`apps/web/.e2e-wallet.json` (gitignored, `E2E_MNEMONIC` overrides it). Path
m/84'/1'/0'/0/0 of the entropy named. Derivations live in
`apps/web/scripts/rgbpp/kit.mjs`; `npm run e2e:wallet` shows Alice.

| Role | Address | Entropy | Who can spend | Balance 2026-09-25 |
|---|---|---|---|---|
| Alice — e2e wallet, promoter in `rgbpp:live` | `tb1q93pwzegduvqq2mahaxy6vq0ydnz5yqv9kz7qc4` | the mnemonic's | us only | 14,088 sats |
| Bob — second party in `rgbpp:live` | `tb1qp3em8ca7qz99mxvezuhr74flkpftnpfenyhuqq` | `sha256(alice ‖ "btcfun/bob")` | us only | 199,035 sats |
| Demo — the site's shared "demo wallet" | `tb1qjjq482m9pj7dvge0l2r07a3fcyflktrzgzf6tz` | `sha256(alice ‖ "btcfun/demo")`, published as `DEMO_ENTROPY_HEX` in `apps/web/src/adapters/vault/vault.ts` | **anyone** — the secret is public | 187,844 sats |

The three stay separate on purpose: the live run needs two independent parties
(promoter and buyer), and the demo wallet is public, so any balance there can be
spent by a stranger at any moment. Keep working funds in Bob and move them to
Alice or the demo wallet as a step needs them. Balances above are a snapshot;
check `https://mempool.space/testnet/address/<address>` before relying on them.
