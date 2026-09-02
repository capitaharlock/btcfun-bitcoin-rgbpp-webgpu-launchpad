---
title: Stack
updated: 2026-09-23
status: draft
---

# Stack — candidates and validation obligations

| Layer | Direction | Required evidence |
|---|---|---|
| Issuance clock | Bitcoin block height, candidate half-life 1008 blocks | Accepted-header/SPV policy, confirmations, freshness, reorg behavior (`V8`) |
| Ownership | Bitcoin UTXOs through RGB++, explicit CKB execution states | Real authorization lifecycle and unilateral recovery (`V3`, `V9`) |
| Token | xUDT | Type identity, owner-mode restrictions, extension and burn compatibility (`V2`, `PC8`) |
| Contracts | Rust `no_std`, `ckb-std`, CKB-VM/RISC-V | Reproducible builds, script tests and complete-transaction cycles |
| Math | Integer amounts + checked `mul_div`; fixed-point only where justified | Canonical rounding, independent reference, Rust/TS vectors (`E2`, `V5`) |
| PoW | SHA256d or Eaglesong, unresolved | Cost, challenge binding and hardware concentration; choose on evidence (`SH3`, `V7`) |
| Miner | WebGPU with WASM fallback | Correctness parity, responsiveness and device/energy measurements |
| SDK | Evaluate `RGBPlusPlus/rgbpp-sdk` and `@ckb-ccc/rgbpp` | Pin tested versions, networks, script deployments and service dependencies |
| Wallet | One real wallet selected in `V3` | Actual ticket/claim/redemption signatures, not just PSBT support |
| Reserve | One directly manageable CKB-side asset for first demo | Exact denomination, custody and occupied-capacity accounting (`V6`) |
| Client | TypeScript, React, Vite, TanStack Query, Zod | Minimal integrated flow and independent proof inspection |
| Services | TypeScript settler + rebuildable indexer | Operator failure, resumption, idempotency and externally usable data |
| Storage | PostgreSQL; Redis/Valkey only if justified | Durable admission evidence must not live only in a transient queue |
| Hosting / CI | Cloudflare, Fly.io, GitHub Actions as needed | Measured operating costs and reproducible environment |

The original `utxostack/rgbpp-sdk` repository is archived and points to its
successor. Do not assume a fork or a preview package is production-ready; `V3`
records actual release maturity and API compatibility. Sources are recorded in
`.meshkore/docs/design-review.md`.

No parallel native-BTC reserve implementation, multiple-wallet suite, payment
channels, or full marketplace in the first demo. Testnet network support must be
verified across the wallet, SDK, SPV service and deployed scripts as one system.
