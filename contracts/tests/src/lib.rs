//! The mint script run by CKB-VM against the real xUDT and RGB++ lock.
//!
//! Each test builds one transaction the way a wallet would — a Bitcoin
//! transaction that spends the sealed UTXOs and commits to the CKB transaction,
//! and the CKB transaction that carries it as the RGB++ unlock — and asserts the
//! script's decision. Refusals are asserted by error code, so a transaction
//! rejected for the wrong reason does not pass as a refusal.

#![cfg(test)]

mod env;
mod mint;
