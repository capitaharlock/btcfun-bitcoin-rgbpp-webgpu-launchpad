//! Script identities this script trusts, for the network it is built for.
//!
//! These are the deployed RGB++ lock and xUDT on CKB testnet (the Bitcoin
//! testnet3 deployment, `rgbpp-sdk` `TestnetInfo`). A mainnet build must
//! replace them; a wrong value fails closed, since no cell would match.

/// `hash_type: type` as the byte a packed `Script` carries.
const TYPE: u8 = 1;

pub const RGBPP_LOCK_CODE_HASH: &[u8] =
    &hex32("61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248");
pub const RGBPP_LOCK_HASH_TYPE: u8 = TYPE;

pub const XUDT_CODE_HASH: &[u8] =
    &hex32("25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb");
pub const XUDT_HASH_TYPE: u8 = TYPE;

/// xUDT flag: owner mode when an input's type script hash equals the owner
/// hash (RFC 0052). The owner hash is this script's hash.
pub const XUDT_OWNER_BY_INPUT_TYPE: u32 = 0x8000_0000;

const fn hex32(s: &str) -> [u8; 32] {
    let b = s.as_bytes();
    let mut out = [0u8; 32];
    let mut i = 0;
    while i < 32 {
        out[i] = (nibble(b[2 * i]) << 4) | nibble(b[2 * i + 1]);
        i += 1;
    }
    out
}

const fn nibble(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => c - b'a' + 10,
        _ => panic!("not lowercase hex"),
    }
}
