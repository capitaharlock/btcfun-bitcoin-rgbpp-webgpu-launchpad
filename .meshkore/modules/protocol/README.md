---
title: "Mint script"
category: modules
tags: [protocol]
updated: 2026-09-24
owner: rjj
status: active
related: [project]
---

# Mint script

**Code:** `contracts/` — `mint-core` (the standard tokenomics as pure Rust),
`mint` (the CKB type script), `tests` (CKB-VM tests with `ckb-testtool`) and
`vectors/reward.json`, which the browser client also reproduces.

**Build and test:**

```sh
cd contracts
cargo build -p btcfun-mint --release --target riscv64imac-unknown-none-elf
cargo test
```

The rules are `PROTOCOL.md` §4 and §6.3. Earlier tasks PC1–PC8 specified an
epoch-and-reserve model that the standard tokenomics replaced; they are kept as
history.
