//! The Bitcoin side: output scripts, the transaction that creates a paid cell,
//! a forged unlock, and the RGB++ commitment a Bitcoin transaction carries.

use super::Env;
use ckb_testtool::ckb_types::{bytes::Bytes, core::TransactionView, packed::*, prelude::*};
use rgbpp_core::bitcoin::{encode_btc_tx, sha2, BTCTx, Digest, Sha256, TxIn, TxOut};
use rgbpp_core::schemas::rgbpp::{ExtraCommitmentData, RGBPPLock, RGBPPUnlock};

/// A Bitcoin output a test can point a seal or a payment at.
pub fn p2wpkh(tag: u8) -> Vec<u8> {
    let mut script = vec![0x00, 0x14];
    script.extend([tag; 20]);
    script
}

/// A Bitcoin transaction as a ticket that creates a paid miner cell builds it:
/// commitment at 0, the seal at 1, then `payments`. Returns its serialization
/// without witness and its txid (internal order).
pub fn creating_tx(payments: Vec<(i64, Vec<u8>)>) -> (Bytes, [u8; 32]) {
    let mut outputs = vec![TxOut::new_seal(0, [0x9c; 32]), TxOut { value: 546, script: p2wpkh(0x01).into() }];
    outputs.extend(payments.into_iter().map(|(value, script)| TxOut { value, script: script.into() }));
    let btc = BTCTx {
        txid: [0u8; 32].pack(),
        version: 2,
        lock_time: 0,
        inputs: vec![TxIn { previous_output: ([0x5a; 32].pack(), 0), script: Bytes::new(), sequence: 0xffff_fffd }],
        outputs,
    };
    let raw = encode_btc_tx(btc);
    let txid = sha2(&sha2(&raw));
    (raw, txid)
}

/// A syntactically valid RGB++ unlock for an arbitrary Bitcoin transaction —
/// what an attacker could write into a witness nobody verifies.
pub fn forged_unlock(outputs: Vec<(i64, Vec<u8>)>, seal: ([u8; 32], u32), height: u32) -> Bytes {
    let btc = BTCTx {
        txid: [0u8; 32].pack(),
        version: 2,
        lock_time: 0,
        inputs: vec![TxIn { previous_output: (seal.0.pack(), seal.1), script: Bytes::new(), sequence: 0 }],
        outputs: outputs
            .into_iter()
            .map(|(value, script)| TxOut { value, script: script.into() })
            .collect(),
    };
    let proof = ckb_bitcoin_spv_verifier::types::packed::TransactionProof::new_builder()
        .height(ckb_bitcoin_spv_verifier::types::prelude::Pack::pack(&height))
        .build();
    let unlock = RGBPPUnlock::new_builder()
        .extra_data(ExtraCommitmentData::new_builder().input_len(1.into()).output_len(1.into()).build())
        .btc_tx(encode_btc_tx(btc).pack())
        .btc_tx_proof(proof.as_slice().to_vec().pack())
        .build();
    WitnessArgs::new_builder().lock(Some(unlock.as_bytes()).pack()).build().as_bytes()
}

/// The RGB++ commitment, computed as the lock computes it.
pub(super) fn commitment(env: &Env, tx: &TransactionView, extra: &ExtraCommitmentData) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"RGB++");
    hasher.update([0, 0]);
    let (inputs, outputs) = (u8::from(extra.input_len()), u8::from(extra.output_len()));
    hasher.update([inputs, outputs]);
    for op in tx.input_pts_iter().take(inputs as usize) {
        hasher.update(op.as_slice());
    }
    for (output, data) in tx.outputs_with_data_iter().take(outputs as usize) {
        let lock = output.lock();
        let output = if lock.code_hash() == env.rgbpp_lock_code {
            let args = RGBPPLock::from_slice(&lock.args().raw_data())
                .unwrap()
                .as_builder()
                .btc_txid(Byte32::default())
                .build();
            output.as_builder().lock(lock.as_builder().args(args.as_bytes().pack()).build()).build()
        } else {
            output
        };
        hasher.update(output.as_slice());
        hasher.update((data.len() as u32).to_le_bytes());
        hasher.update(&data);
    }
    sha2(&hasher.finalize())
}
