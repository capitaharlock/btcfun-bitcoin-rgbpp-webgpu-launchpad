//! A launch's admission: the registration txid and btc.fun's certificate over
//! the mint script's args, as the first arming of a miner cell carries it.

use ckb_testtool::ckb_types::{bytes::Bytes, packed::Script, prelude::*};

/// A launch's admission — registration txid and certificate — signed by
/// `secret` over the mint script's args. The test build trusts only
/// `TEST_CERT_SECRET`'s key.
pub fn admission(mint: &Script, secret: &[u8; 32]) -> Vec<u8> {
    admission_over(mint, secret, [0x7e; 32])
}

/// `secret`'s certificate over the launch and a registration txid of the test's choosing.
pub fn admission_over(mint: &Script, secret: &[u8; 32], registration: [u8; 32]) -> Vec<u8> {
    let args: Bytes = mint.args().unpack();
    let key = k256::schnorr::SigningKey::from_bytes(secret).unwrap();
    let message = mint_core::certificate_message(&args, &registration);
    let signature = key.sign_raw(&message, &[0u8; 32]).unwrap().to_bytes();
    [registration.as_slice(), signature.as_slice()].concat()
}
