//! One RGB++ operation: the CKB transaction and the Bitcoin transaction that
//! commits to it, built together so the seals and the commitment agree.

use super::bitcoin::commitment;
use super::{Env, H0};
use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{Capacity, TransactionView},
    packed::*,
    prelude::*,
};
use rgbpp_core::bitcoin::{encode_btc_tx, sha2, BTCTx, TxIn, TxOut};
use rgbpp_core::schemas::rgbpp::{ExtraCommitmentData, RGBPPUnlock, Uint16};

/// A CKB output, sealed to a Bitcoin output of the transaction being built
/// when `seal` is set.
pub struct Out {
    pub seal: Option<u32>,
    pub lock: Option<Script>,
    pub type_: Option<Script>,
    pub data: Vec<u8>,
}

/// One RGB++ operation under construction.
pub struct Op {
    /// Typed inputs, RGB++-locked, first; their seals are spent by the Bitcoin tx.
    pub inputs: Vec<(CellInput, Option<([u8; 32], u32)>)>,
    pub outputs: Vec<Out>,
    /// Witnesses to put in place of the generated ones, by input index.
    pub witness_overrides: Vec<(usize, Bytes)>,
    /// The btc.fun witness, appended past the inputs' witnesses.
    pub btcfun_witness: Option<Bytes>,
    /// Bitcoin outputs after the commitment: seals and payments.
    pub btc_outputs: Vec<(i64, Vec<u8>)>,
    pub height: u32,
}

impl Op {
    pub fn new() -> Self {
        Op { inputs: vec![], outputs: vec![], witness_overrides: vec![], btcfun_witness: None, btc_outputs: vec![], height: H0 }
    }

    /// Build the Bitcoin transaction and the CKB transaction committed by it.
    /// Returns the CKB transaction and the Bitcoin txid (internal order).
    pub fn build(self, env: &Env) -> (TransactionView, [u8; 32]) {
        let typed_inputs = self.inputs.iter().filter(|(_, seal)| seal.is_some()).count();
        let typed_outputs = self.outputs.iter().filter(|o| o.type_.is_some()).count();

        let outputs: Vec<CellOutput> = self
            .outputs
            .iter()
            .map(|o| {
                let lock = match (o.seal, &o.lock) {
                    (Some(vout), _) => env.rgbpp_lock([0u8; 32], vout),
                    (None, Some(lock)) => lock.clone(),
                    (None, None) => env.always_lock.clone(),
                };
                CellOutput::new_builder()
                    .capacity(Capacity::shannons(500 * 100_000_000).pack())
                    .lock(lock)
                    .type_(o.type_.clone().pack())
                    .build()
            })
            .collect();
        let data: Vec<Bytes> = self.outputs.iter().map(|o| Bytes::from(o.data.clone())).collect();

        let tx = TransactionView::new_advanced_builder()
            .inputs(self.inputs.iter().map(|(input, _)| input.clone()))
            .outputs(outputs.clone())
            .outputs_data(data.iter().map(|d| d.pack()))
            .cell_deps(env.deps())
            .build();

        if typed_inputs == 0 {
            // A CKB-only transaction: nothing to commit to Bitcoin.
            let witness = WitnessArgs::new_builder().build();
            return (tx.as_advanced_builder().witness(witness.as_bytes().pack()).build(), [0; 32]);
        }

        let extra = ExtraCommitmentData::new_builder()
            .input_len((typed_inputs as u8).into())
            .output_len((typed_outputs.max(1) as u8).into())
            .build();
        let commitment = commitment(env, &tx, &extra);

        let mut btc_outputs = vec![TxOut::new_seal(0, commitment)];
        btc_outputs.extend(self.btc_outputs.iter().map(|(value, script)| TxOut {
            value: *value,
            script: script.clone().into(),
        }));
        let btc = BTCTx {
            txid: [0u8; 32].pack(),
            version: 2,
            lock_time: 0,
            inputs: self
                .inputs
                .iter()
                .filter_map(|(_, seal)| *seal)
                .map(|(txid, vout)| TxIn {
                    previous_output: (txid.pack(), vout),
                    script: Bytes::new(),
                    sequence: 0xffff_fffd,
                })
                .collect(),
            outputs: btc_outputs,
        };
        let raw = encode_btc_tx(btc);
        let btc_txid = sha2(&sha2(&raw));

        // Now that the Bitcoin txid exists, write it into the sealed outputs.
        let sealed: Vec<CellOutput> = self
            .outputs
            .iter()
            .zip(outputs)
            .map(|(o, cell)| match o.seal {
                Some(vout) => cell.as_builder().lock(env.rgbpp_lock(btc_txid, vout)).build(),
                None => cell,
            })
            .collect();

        let proof = ckb_bitcoin_spv_verifier::types::packed::TransactionProof::new_builder()
            .height(ckb_bitcoin_spv_verifier::types::prelude::Pack::pack(&self.height))
            .build();
        let unlock = RGBPPUnlock::new_builder()
            .version(Uint16::default())
            .extra_data(extra)
            .btc_tx(raw.pack())
            .btc_tx_proof(proof.as_slice().to_vec().pack())
            .build();

        // The first input carries the unlock; every other sealed input points
        // at it, as the RGB++ lock allows.
        let mut witnesses = vec![WitnessArgs::new_builder()
            .lock(Some(unlock.as_bytes()).pack())
            .build()
            .as_bytes()
            .pack()];
        for (_, seal) in self.inputs.iter().skip(1) {
            let witness = match seal {
                Some(_) => WitnessArgs::new_builder()
                    .lock(Some(Bytes::from(0u32.to_le_bytes().to_vec())).pack())
                    .build()
                    .as_bytes(),
                None => Bytes::new(),
            };
            witnesses.push(witness.pack());
        }

        for (index, witness) in &self.witness_overrides {
            witnesses[*index] = witness.pack();
        }
        if let Some(witness) = &self.btcfun_witness {
            witnesses.push(witness.pack());
        }

        let tx = tx
            .as_advanced_builder()
            .set_outputs(sealed)
            .set_witnesses(witnesses)
            .build();
        (tx, btc_txid)
    }
}
