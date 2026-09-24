//! A CKB context holding the scripts a mint touches, and a builder for the
//! paired Bitcoin and CKB transactions of one RGB++ operation.

mod admission;
mod bitcoin;
mod context;
mod op;

pub use admission::{admission, admission_over};
pub use bitcoin::{creating_tx, forged_unlock, p2wpkh};
pub use context::Env;
pub use op::{Op, Out};

pub const MAX_CYCLES: u64 = 70_000_000;
pub const H0: u32 = 150_000;
pub const XUDT_OWNER_BY_INPUT_TYPE: u32 = 0x8000_0000;

/// The error code a failed verification reports, if a script reported one.
pub fn error_code(err: &str) -> Option<i8> {
    let at = err.find("error code ")? + "error code ".len();
    err[at..].split(|c: char| !(c == '-' || c.is_ascii_digit())).next()?.parse().ok()
}
