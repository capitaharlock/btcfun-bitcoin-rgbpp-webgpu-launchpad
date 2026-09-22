//! A CKB context holding the scripts a mint touches, and a builder for the
//! paired Bitcoin and CKB transactions of one RGB++ operation.

use ckb_testtool::builtin::ALWAYS_SUCCESS;
use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{Capacity, DepType, ScriptHashType, TransactionView},
    packed::*,
    prelude::*,
};
use ckb_testtool::context::Context;
use rgbpp_core::bitcoin::{encode_btc_tx, sha2, BTCTx, Digest, Sha256, TxIn, TxOut};
use rgbpp_core::schemas::rgbpp::{ExtraCommitmentData, RGBPPLock, RGBPPUnlock, Uint16};

pub const MAX_CYCLES: u64 = 70_000_000;
pub const H0: u32 = 150_000;
pub const XUDT_OWNER_BY_INPUT_TYPE: u32 = 0x8000_0000;

const TYPE_ID_CODE_HASH: [u8; 32] = {
    let mut hash = [0u8; 32];
    let tag = *b"TYPE_ID";
    let mut i = 0;
    while i < tag.len() {
        hash[32 - tag.len() + i] = tag[i];
        i += 1;
    }
    hash
};

fn hex(s: &str) -> Vec<u8> {
    let s = s.trim_start_matches("0x");
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

fn type_id(args: &str) -> Script {
    Script::new_builder()
        .code_hash(TYPE_ID_CODE_HASH.pack())
        .hash_type(ScriptHashType::Type.into())
        .args(Bytes::from(hex(args)).pack())
        .build()
}

/// A Bitcoin output a test can point a seal or a payment at.
pub fn p2wpkh(tag: u8) -> Vec<u8> {
    let mut script = vec![0x00, 0x14];
    script.extend([tag; 20]);
    script
}

pub struct Env {
    pub ctx: Context,
    pub rgbpp_lock_code: Byte32,
    rgbpp_lock_dep: CellDep,
    rgbpp_config_dep: CellDep,
    xudt_code: Byte32,
    xudt_dep: CellDep,
    mint_dep: CellDep,
    mint_out_point: OutPoint,
    always_dep: CellDep,
    pub always_lock: Script,
    pub promoter: Vec<u8>,
}

impl Env {
    pub fn new() -> Self {
        let mut ctx = Context::default();
        let deployed = |name: &str| -> Bytes {
            std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/deployed/").to_owned() + name)
                .unwrap()
                .into()
        };
        let binary = |name: &str| -> Bytes {
            std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/binaries/").to_owned() + name)
                .unwrap()
                .into()
        };

        // The RGB++ lock expects its config in the cell right after its code,
        // in the same transaction, as on chain.
        let rgbpp_tx = Byte32::from_slice(&hex(
            "0d1567da0979f78b297d5311442669fbd1bd853c8be324c5ab6da41e7a1ed6e5",
        ))
        .unwrap();
        let rgbpp_code_op = OutPoint::new(rgbpp_tx.clone(), 0);
        let rgbpp_config_op = OutPoint::new(rgbpp_tx, 1);
        let rgbpp_type = type_id("a3bc8441df149def76cfe15fec7b1e51d949548bc27fb7a75e9d4b3ef1c12c7f");
        let rgbpp_lock_code = rgbpp_type.calc_script_hash();
        ctx.create_cell_with_out_point(
            rgbpp_code_op.clone(),
            code_cell(Some(rgbpp_type)),
            binary("rgbpp-lock-mock-light-client"),
        );
        ctx.create_cell_with_out_point(
            rgbpp_config_op.clone(),
            code_cell(Some(type_id(
                "8ea65584bb41eb2403b221b47c92b506ca817b9ebd1b0b2ef5d85b4bff2df293",
            ))),
            deployed("rgbpp_config"),
        );

        let xudt_op = OutPoint::new(
            Byte32::from_slice(&hex(
                "bf6fb538763efec2a70a6a3dcb7242787087e1030c4e7d86585bc63a9d337f5f",
            ))
            .unwrap(),
            0,
        );
        let xudt_type = type_id("44ec8b96663e06cc94c8c468a4d46d7d9af69eaf418f6390c9f11bb763dda0ae");
        let xudt_code = xudt_type.calc_script_hash();
        ctx.create_cell_with_out_point(xudt_op.clone(), code_cell(Some(xudt_type)), deployed("xudt"));

        // The identities the mint script is compiled to trust must be these.
        assert_eq!(
            rgbpp_lock_code.as_slice(),
            hex("61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248")
        );
        assert_eq!(
            xudt_code.as_slice(),
            hex("25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb")
        );

        let mint_out_point = ctx.deploy_cell(
            std::fs::read(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../target/test-cert/riscv64imac-unknown-none-elf/release/btcfun-mint"
            ))
            .expect(
                "build the test script first: cargo build -p btcfun-mint --release --target riscv64imac-unknown-none-elf \
                 --features test-cert-key --target-dir target/test-cert",
            )
            .into(),
        );
        let always_op = ctx.deploy_cell(ALWAYS_SUCCESS.clone());
        let always_lock = ctx.build_script(&always_op, Bytes::new()).unwrap();

        let dep = |op: &OutPoint| CellDep::new_builder().out_point(op.clone()).dep_type(DepType::Code.into()).build();
        Env {
            rgbpp_lock_dep: dep(&rgbpp_code_op),
            rgbpp_config_dep: dep(&rgbpp_config_op),
            xudt_dep: dep(&xudt_op),
            mint_dep: dep(&mint_out_point),
            always_dep: dep(&always_op),
            ctx,
            rgbpp_lock_code,
            xudt_code,
            mint_out_point,
            always_lock,
            promoter: p2wpkh(0xaa),
        }
    }

    /// The mint script for a launch opening at `h0` and paying `promoter`.
    pub fn mint_type(&mut self, h0: u32, promoter: &[u8]) -> Script {
        let mut args = vec![mint_core::TERMS_VERSION];
        args.extend_from_slice(&h0.to_le_bytes());
        args.extend_from_slice(&[0x5e; 32]);
        args.push(promoter.len() as u8);
        args.extend_from_slice(promoter);
        self.ctx.build_script(&self.mint_out_point, args.into()).unwrap()
    }

    /// The launch's xUDT: owner is the mint script, by input type.
    pub fn xudt_type(&self, mint: &Script) -> Script {
        let mut args = mint.calc_script_hash().as_slice().to_vec();
        args.extend_from_slice(&XUDT_OWNER_BY_INPUT_TYPE.to_le_bytes());
        Script::new_builder()
            .code_hash(self.xudt_code.clone())
            .hash_type(ScriptHashType::Type.into())
            .args(Bytes::from(args).pack())
            .build()
    }

    pub fn rgbpp_lock(&self, txid: [u8; 32], vout: u32) -> Script {
        let args = RGBPPLock::new_builder()
            .out_index(vout.pack())
            .btc_txid(txid.pack())
            .build();
        Script::new_builder()
            .code_hash(self.rgbpp_lock_code.clone())
            .hash_type(ScriptHashType::Type.into())
            .args(args.as_bytes().pack())
            .build()
    }

    /// A live cell, returned as an input.
    pub fn live(&mut self, lock: Script, type_: Option<Script>, data: Vec<u8>) -> CellInput {
        let cell = CellOutput::new_builder()
            .capacity(Capacity::shannons(1_000 * 100_000_000).pack())
            .lock(lock)
            .type_(type_.pack())
            .build();
        let op = self.ctx.create_cell(cell, data.into());
        CellInput::new_builder().previous_output(op).build()
    }

    pub fn verify(&self, tx: &TransactionView) -> Result<u64, String> {
        self.ctx.verify_tx(tx, MAX_CYCLES).map_err(|e| e.to_string())
    }

    fn deps(&self) -> Vec<CellDep> {
        vec![
            self.rgbpp_lock_dep.clone(),
            self.rgbpp_config_dep.clone(),
            self.xudt_dep.clone(),
            self.mint_dep.clone(),
            self.always_dep.clone(),
        ]
    }
}

fn code_cell(type_: Option<Script>) -> CellOutput {
    CellOutput::new_builder()
        .capacity(Capacity::shannons(1_000_000 * 100_000_000).pack())
        .type_(type_.pack())
        .build()
}

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
fn commitment(env: &Env, tx: &TransactionView, extra: &ExtraCommitmentData) -> [u8; 32] {
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

/// The error code a failed verification reports, if a script reported one.
pub fn error_code(err: &str) -> Option<i8> {
    let at = err.find("error code ")? + "error code ".len();
    err[at..].split(|c: char| !(c == '-' || c.is_ascii_digit())).next()?.parse().ok()
}

/// A launch's admission — registration txid and certificate — signed by
/// `secret` over the mint script's args. The test build trusts only
/// `TEST_CERT_SECRET`'s key.
pub fn admission(mint: &Script, secret: &[u8; 32]) -> Vec<u8> {
    let args: Bytes = mint.args().unpack();
    let registration = [0x7e; 32];
    let key = k256::schnorr::SigningKey::from_bytes(secret).unwrap();
    let message = mint_core::certificate_message(&args, &registration);
    let signature = key.sign_raw(&message, &[0u8; 32]).unwrap().to_bytes();
    [registration.as_slice(), signature.as_slice()].concat()
}
