//! Every transition of the miner cell, and every way to cheat one. This module
//! holds the script's error codes and the fixtures; each section of the
//! lifecycle is a submodule.

mod open;
mod ticket;
mod minting;
mod close;
mod witness;
mod paid_cell;
mod dissolve;
mod pre_arm;
mod certified;

use crate::env::*;
use ckb_testtool::ckb_types::packed::Script;
use ckb_testtool::ckb_types::bytes::Bytes;
use mint_core::{
    reward, ticket_challenge, work_clz, MinerCell, MinerState, ANCHOR_GRACE_BLOCKS, HALVING_BLOCKS, MIN_CLZ, NEW_CELL,
    PLATFORM_SCRIPT, REUSE,
};

// A re-armed cell's ticket, which most tests buy.
const PROMOTER_SATS: u64 = REUSE.promoter;
const PLATFORM_FEE_SATS: u64 = REUSE.platform;

// The script's error codes (`mint/src/main.rs`).
const TOO_MANY_MINER_CELLS: i8 = 4;
const NOT_RGBPP_LOCK: i8 = 5;
const TICKET_UNPAID: i8 = 9;
const WORK_TOO_WEAK: i8 = 10;
const WRONG_AMOUNT: i8 = 11;
const BALANCE_INCREASED: i8 = 12;
const ARMED_WITHOUT_TICKET: i8 = 13;
const BAD_ANCHOR: i8 = 14;
const MINT_MUST_DISARM: i8 = 15;
const PAID_BESIDE_RGBPP_INPUT: i8 = 18;
const PAID_CANNOT_MOVE: i8 = 19;
const BAD_BTCFUN_WITNESS: i8 = 20;
const BAD_PAID_SEAL: i8 = 21;
const PAID_ARMED_BESIDE_OTHERS: i8 = 22;
const BAD_TICKET_NAME: i8 = 23;
const NOT_CERTIFIED: i8 = 24;
const OPENED_IDLE: i8 = 25;

const IDLE: MinerState = MinerState::Idle;
const ARMED: MinerState = MinerState::Armed;
const PAID: MinerState = MinerState::Paid;

fn cell(state: MinerState, nonce: u64) -> Vec<u8> {
    anchored(state, nonce, H0)
}

fn anchored(state: MinerState, nonce: u64, anchor: u32) -> Vec<u8> {
    MinerCell { state, nonce, anchor, ticket: None }.encode().to_vec()
}

/// An armed cell naming `ticket` as its challenge, as the arming of a paid cell writes it.
fn naming(anchor: u32, ticket: [u8; 32]) -> Vec<u8> {
    MinerCell { state: MinerState::Armed, nonce: 0, anchor, ticket: Some(ticket) }.encode().to_vec()
}
const TICKET_TXID: [u8; 32] = [0x71; 32];
const TICKET_VOUT: u32 = 1;

fn amount(atoms: u128) -> Vec<u8> {
    atoms.to_le_bytes().to_vec()
}

/// A nonce whose work against the ticket has at least `min` leading zeros —
/// or, with `below`, fewer than `min`.
fn nonce_for(min: u32, below: bool) -> (u64, u32) {
    let challenge = ticket_challenge(&TICKET_TXID, TICKET_VOUT);
    (0u64..)
        .map(|n| (n, work_clz(&challenge, n)))
        .find(|(_, clz)| if below { *clz < min } else { *clz >= min })
        .unwrap()
}

struct Launch {
    env: Env,
    mint: Script,
    udt: Script,
}

impl Launch {
    fn new() -> Self {
        let mut env = Env::new();
        let promoter = env.promoter.clone();
        let mint = env.mint_type(H0, &promoter);
        let udt = env.xudt_type(&mint);
        Launch { env, mint, udt }
    }

    fn miner_input(&mut self, state: MinerState) -> (ckb_testtool::ckb_types::packed::CellInput, Option<([u8; 32], u32)>) {
        self.miner_input_at(state, H0)
    }

    /// A miner cell sealed to the test ticket, its anchor at `anchor`.
    fn miner_input_at(&mut self, state: MinerState, anchor: u32) -> (ckb_testtool::ckb_types::packed::CellInput, Option<([u8; 32], u32)>) {
        let lock = self.env.rgbpp_lock(TICKET_TXID, TICKET_VOUT);
        let input = self.env.live(lock, Some(self.mint.clone()), anchored(state, 0, anchor));
        (input, Some((TICKET_TXID, TICKET_VOUT)))
    }

    fn miner_out(&self, state: MinerState) -> Out {
        self.miner_out_with(state, 0)
    }

    fn miner_out_with(&self, state: MinerState, nonce: u64) -> Out {
        Out { seal: Some(1), lock: None, type_: Some(self.mint.clone()), data: cell(state, nonce) }
    }

    fn miner_out_anchored(&self, state: MinerState, anchor: u32) -> Out {
        Out { seal: Some(1), lock: None, type_: Some(self.mint.clone()), data: anchored(state, 0, anchor) }
    }

    fn udt_out(&self, atoms: u128) -> Out {
        Out { seal: Some(1), lock: None, type_: Some(self.udt.clone()), data: amount(atoms) }
    }

    /// One ticket's two payments: the promoter's share and the platform's fee.
    fn ticket(&self) -> [(i64, Vec<u8>); 2] {
        [(PROMOTER_SATS as i64, self.env.promoter.clone()), (PLATFORM_FEE_SATS as i64, PLATFORM_SCRIPT.to_vec())]
    }

    /// A mint of a ticket anchored at H0 with the given nonce, confirmed at
    /// `height`, claiming `atoms`. A re-armed cell is anchored at `height`.
    fn mint_op(&mut self, nonce: u64, height: u32, atoms: u128, next: MinerState) -> Op {
        let mut op = Op::new();
        op.inputs.push(self.miner_input(ARMED));
        let mut out = self.miner_out_with(next, nonce);
        out.data = anchored(next, nonce, height);
        op.outputs.push(out);
        op.outputs.push(self.udt_out(atoms));
        op.btc_outputs.push((546, p2wpkh(0x01)));
        op.height = height;
        op
    }
}

fn expect_code(result: Result<u64, String>, code: i8) {
    let err = result.expect_err("the transaction must be rejected");
    assert_eq!(error_code(&err), Some(code), "{err}");
}

// A ticket that creates its miner cell (`paid_cell`, `pre_arm`, `certified`).

/// The new-cell ticket's two shares (the paymaster's is not the script's business).
fn new_cell_ticket(l: &Launch) -> Vec<(i64, Vec<u8>)> {
    vec![(NEW_CELL.promoter as i64, l.env.promoter.clone()), (NEW_CELL.platform as i64, PLATFORM_SCRIPT.to_vec())]
}

impl Launch {
    /// A paid cell sealed to output `vout` of `creating`.
    fn paid_input(&mut self, creating: [u8; 32], vout: u32) -> (ckb_testtool::ckb_types::packed::CellInput, Option<([u8; 32], u32)>) {
        let lock = self.env.rgbpp_lock(creating, vout);
        let input = self.env.live(lock, Some(self.mint.clone()), cell(PAID, 0));
        (input, Some((creating, vout)))
    }

    /// Arm a paid cell created by a transaction paying `payments`, carrying `witness`.
    fn arm_paid(&mut self, payments: Vec<(i64, Vec<u8>)>, witness: impl FnOnce(Bytes) -> Option<Bytes>) -> Op {
        let (raw, id) = creating_tx(payments);
        let mut op = Op::new();
        op.inputs.push(self.paid_input(id, 1));
        op.outputs.push(Out { seal: Some(1), lock: None, type_: Some(self.mint.clone()), data: naming(H0, id) });
        op.btc_outputs.push((546, p2wpkh(0x01)));
        let admission = admission(&self.mint, &mint_core::TEST_CERT_SECRET);
        op.btcfun_witness = witness(raw).map(|raw| Bytes::from([admission, raw.to_vec()].concat()));
        op
    }
}
