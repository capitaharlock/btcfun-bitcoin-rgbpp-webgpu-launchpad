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
