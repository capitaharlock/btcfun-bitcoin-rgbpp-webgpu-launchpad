//! The CKB context: the deployed RGB++ lock and its config, the xUDT, the mint
//! script under test and an always-success lock, at their on-chain identities.

use super::{p2wpkh, MAX_CYCLES, XUDT_OWNER_BY_INPUT_TYPE};
use ckb_testtool::builtin::ALWAYS_SUCCESS;
use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{Capacity, DepType, ScriptHashType, TransactionView},
    packed::*,
    prelude::*,
};
use ckb_testtool::context::Context;
use rgbpp_core::schemas::rgbpp::RGBPPLock;

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

    pub(super) fn deps(&self) -> Vec<CellDep> {
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
