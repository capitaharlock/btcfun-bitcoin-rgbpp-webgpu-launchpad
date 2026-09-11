//! Every transition of the miner cell, and every way to cheat one.

use crate::env::*;
use ckb_testtool::ckb_types::packed::Script;
use mint_core::{reward, ticket_challenge, work_clz, MinerCell, MinerState, HALVING_BLOCKS, MIN_CLZ, TICKET_SATS};

// The script's error codes (`mint/src/main.rs`).
const TOO_MANY_MINER_CELLS: i8 = 4;
const NOT_RGBPP_LOCK: i8 = 5;
const TICKET_UNPAID: i8 = 9;
const WORK_TOO_WEAK: i8 = 10;
const WRONG_AMOUNT: i8 = 11;
const BALANCE_INCREASED: i8 = 12;
const ARMED_WITHOUT_TICKET: i8 = 13;

const IDLE: MinerState = MinerState::Idle;
const ARMED: MinerState = MinerState::Armed;

fn cell(state: MinerState, nonce: u64) -> Vec<u8> {
    MinerCell { state, nonce }.encode().to_vec()
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
        let lock = self.env.rgbpp_lock(TICKET_TXID, TICKET_VOUT);
        let input = self.env.live(lock, Some(self.mint.clone()), cell(state, 0));
        (input, Some((TICKET_TXID, TICKET_VOUT)))
    }

    fn miner_out(&self, state: MinerState) -> Out {
        self.miner_out_with(state, 0)
    }

    fn miner_out_with(&self, state: MinerState, nonce: u64) -> Out {
        Out { seal: Some(1), lock: None, type_: Some(self.mint.clone()), data: cell(state, nonce) }
    }

    fn udt_out(&self, atoms: u128) -> Out {
        Out { seal: Some(1), lock: None, type_: Some(self.udt.clone()), data: amount(atoms) }
    }

    fn ticket(&self) -> (i64, Vec<u8>) {
        (TICKET_SATS as i64, self.env.promoter.clone())
    }

    /// A mint of the ticket with the given nonce at `height`, claiming `atoms`.
    fn mint_op(&mut self, nonce: u64, height: u32, atoms: u128, next: MinerState) -> Op {
        let mut op = Op::new();
        op.inputs.push(self.miner_input(ARMED));
        op.outputs.push(self.miner_out_with(next, nonce));
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

// ─── Open ────────────────────────────────────────────────────────────────

#[test]
fn anyone_can_open_an_idle_miner_cell() {
    let mut l = Launch::new();
    let funding = l.env.live(l.env.always_lock.clone(), None, vec![]);
    let mut op = Op::new();
    op.inputs.push((funding, None));
    op.outputs.push(Out {
        seal: None,
        lock: Some(l.env.rgbpp_lock([0x33; 32], 0)),
        type_: Some(l.mint.clone()),
        data: cell(IDLE, 0),
    });
    let (tx, _) = op.build(&l.env);
    let cycles = l.env.verify(&tx).unwrap();
    println!("open: {cycles} cycles");
}

#[test]
fn a_miner_cell_cannot_be_opened_armed() {
    let mut l = Launch::new();
    let funding = l.env.live(l.env.always_lock.clone(), None, vec![]);
    let mut op = Op::new();
    op.inputs.push((funding, None));
    op.outputs.push(Out {
        seal: None,
        lock: Some(l.env.rgbpp_lock([0x33; 32], 0)),
        type_: Some(l.mint.clone()),
        data: cell(ARMED, 0),
    });
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), ARMED_WITHOUT_TICKET);
}

#[test]
fn a_miner_cell_must_be_bound_to_bitcoin() {
    let mut l = Launch::new();
    let funding = l.env.live(l.env.always_lock.clone(), None, vec![]);
    let mut op = Op::new();
    op.inputs.push((funding, None));
    op.outputs.push(Out {
        seal: None,
        lock: Some(l.env.always_lock.clone()),
        type_: Some(l.mint.clone()),
        data: cell(IDLE, 0),
    });
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), NOT_RGBPP_LOCK);
}

// ─── Ticket ──────────────────────────────────────────────────────────────

#[test]
fn a_paid_ticket_arms_the_cell() {
    let mut l = Launch::new();
    let mut op = Op::new();
    op.inputs.push(l.miner_input(IDLE));
    op.outputs.push(l.miner_out(ARMED));
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btc_outputs.push(l.ticket());
    let (tx, _) = op.build(&l.env);
    let cycles = l.env.verify(&tx).unwrap();
    println!("ticket: {cycles} cycles");
}

#[test]
fn an_unpaid_underpaid_or_misdirected_ticket_is_refused() {
    for payment in [None, Some((TICKET_SATS as i64 - 1, None)), Some((TICKET_SATS as i64, Some(p2wpkh(0xbb))))] {
        let mut l = Launch::new();
        let mut op = Op::new();
        op.inputs.push(l.miner_input(IDLE));
        op.outputs.push(l.miner_out(ARMED));
        op.btc_outputs.push((546, p2wpkh(0x01)));
        if let Some((value, to)) = payment {
            op.btc_outputs.push((value, to.unwrap_or_else(|| l.env.promoter.clone())));
        }
        let (tx, _) = op.build(&l.env);
        expect_code(l.env.verify(&tx), TICKET_UNPAID);
    }
}

#[test]
fn a_ticket_cannot_mint() {
    let mut l = Launch::new();
    let mut op = Op::new();
    op.inputs.push(l.miner_input(IDLE));
    op.outputs.push(l.miner_out(ARMED));
    op.outputs.push(l.udt_out(1));
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btc_outputs.push(l.ticket());
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), BALANCE_INCREASED);
}

// ─── Mint ────────────────────────────────────────────────────────────────

#[test]
fn a_valid_hash_mints_exactly_the_standard_reward() {
    let mut l = Launch::new();
    let (nonce, clz) = nonce_for(MIN_CLZ, false);
    let atoms = reward(clz, H0, H0 + 10).unwrap();
    let (tx, _) = l.mint_op(nonce, H0 + 10, atoms.into(), IDLE).build(&l.env);
    let cycles = l.env.verify(&tx).unwrap();
    println!("mint (clz {clz}, {atoms} atoms): {cycles} cycles");
}

#[test]
fn more_than_the_reward_is_refused_and_so_is_less() {
    let (nonce, clz) = nonce_for(MIN_CLZ, false);
    let atoms = u128::from(reward(clz, H0, H0).unwrap());
    for claimed in [atoms + 1, atoms - 1] {
        let mut l = Launch::new();
        let (tx, _) = l.mint_op(nonce, H0, claimed, IDLE).build(&l.env);
        expect_code(l.env.verify(&tx), WRONG_AMOUNT);
    }
}

#[test]
fn the_reward_halves_at_the_mints_height() {
    let (nonce, clz) = nonce_for(MIN_CLZ, false);
    let later = H0 + 2 * HALVING_BLOCKS;
    let full = u128::from(reward(clz, H0, H0).unwrap());

    let mut l = Launch::new();
    let (tx, _) = l.mint_op(nonce, later, full, IDLE).build(&l.env);
    expect_code(l.env.verify(&tx), WRONG_AMOUNT);

    let mut l = Launch::new();
    let (tx, _) = l.mint_op(nonce, later, full / 4, IDLE).build(&l.env);
    l.env.verify(&tx).unwrap();
}

#[test]
fn a_weak_hash_mints_nothing() {
    let mut l = Launch::new();
    let (nonce, _) = nonce_for(MIN_CLZ, true);
    let (tx, _) = l.mint_op(nonce, H0, 1, IDLE).build(&l.env);
    expect_code(l.env.verify(&tx), WORK_TOO_WEAK);
}

#[test]
fn nothing_is_minted_before_the_launch_opens() {
    let mut l = Launch::new();
    let (nonce, clz) = nonce_for(MIN_CLZ, false);
    let atoms = reward(clz, H0, H0).unwrap();
    let (tx, _) = l.mint_op(nonce, H0 - 1, atoms.into(), IDLE).build(&l.env);
    expect_code(l.env.verify(&tx), WORK_TOO_WEAK);
}

#[test]
fn the_nonce_is_the_one_the_new_cell_carries() {
    // A strong nonce, but the cell the mint creates records a weak one.
    let (strong, clz) = nonce_for(MIN_CLZ, false);
    let (weak, _) = nonce_for(MIN_CLZ, true);
    let mut l = Launch::new();
    let mut op = l.mint_op(strong, H0, reward(clz, H0, H0).unwrap().into(), IDLE);
    op.outputs[0] = l.miner_out_with(IDLE, weak);
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), WORK_TOO_WEAK);
}

#[test]
fn work_against_another_ticket_does_not_count() {
    // A nonce that is strong for this ticket, used on a cell sealed elsewhere.
    let (nonce, clz) = nonce_for(20, false);
    let other = ticket_challenge(&[0x72; 32], TICKET_VOUT);
    let clz_there = work_clz(&other, nonce);
    assert!(clz_there < clz);

    let mut l = Launch::new();
    let mut op = l.mint_op(nonce, H0, reward(clz, H0, H0).unwrap().into(), IDLE);
    let lock = l.env.rgbpp_lock([0x72; 32], TICKET_VOUT);
    op.inputs[0] = (l.env.live(lock, Some(l.mint.clone()), cell(ARMED, 0)), Some(([0x72; 32], TICKET_VOUT)));
    let (tx, _) = op.build(&l.env);
    let code = error_code(&l.env.verify(&tx).unwrap_err());
    assert!(code == Some(WRONG_AMOUNT) || code == Some(WORK_TOO_WEAK));
}

#[test]
fn minting_and_buying_the_next_ticket_in_one_transaction() {
    let (nonce, clz) = nonce_for(MIN_CLZ, false);
    let atoms = reward(clz, H0, H0).unwrap();

    let mut l = Launch::new();
    let mut op = l.mint_op(nonce, H0, atoms.into(), ARMED);
    op.btc_outputs.push(l.ticket());
    let (tx, _) = op.build(&l.env);
    l.env.verify(&tx).unwrap();

    // Re-arming without paying is a free ticket.
    let mut l = Launch::new();
    let (tx, _) = l.mint_op(nonce, H0, atoms.into(), ARMED).build(&l.env);
    expect_code(l.env.verify(&tx), TICKET_UNPAID);
}

#[test]
fn an_idle_cell_cannot_mint() {
    let (nonce, clz) = nonce_for(MIN_CLZ, false);
    let mut l = Launch::new();
    let mut op = l.mint_op(nonce, H0, reward(clz, H0, H0).unwrap().into(), IDLE);
    op.inputs[0] = l.miner_input(IDLE);
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), BALANCE_INCREASED);
}

#[test]
fn a_mint_adds_to_an_existing_balance() {
    let (nonce, clz) = nonce_for(MIN_CLZ, false);
    let atoms = u128::from(reward(clz, H0, H0).unwrap());
    let mut l = Launch::new();
    let mut op = l.mint_op(nonce, H0, 1_000 + atoms, IDLE);
    let held = l.env.rgbpp_lock([0x44; 32], 0);
    op.inputs.push((l.env.live(held, Some(l.udt.clone()), amount(1_000)), Some(([0x44; 32], 0))));
    let (tx, _) = op.build(&l.env);
    l.env.verify(&tx).unwrap();
}

#[test]
fn one_ticket_arms_one_cell() {
    let mut l = Launch::new();
    let mut op = Op::new();
    op.inputs.push(l.miner_input(IDLE));
    let second = l.env.rgbpp_lock([0x45; 32], 0);
    op.inputs.push((l.env.live(second, Some(l.mint.clone()), cell(IDLE, 0)), Some(([0x45; 32], 0))));
    op.outputs.push(l.miner_out(ARMED));
    op.outputs.push(l.miner_out(ARMED));
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btc_outputs.push(l.ticket());
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), TOO_MANY_MINER_CELLS);
}

// ─── Close, and the xUDT's own guard ─────────────────────────────────────

#[test]
fn closing_a_miner_cell_cannot_mint() {
    let mut l = Launch::new();
    let mut op = Op::new();
    op.inputs.push(l.miner_input(ARMED));
    op.outputs.push(l.udt_out(1));
    op.btc_outputs.push((546, p2wpkh(0x01)));
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), BALANCE_INCREASED);
}

#[test]
fn closing_a_miner_cell_returns_its_capacity() {
    let mut l = Launch::new();
    let mut op = Op::new();
    op.inputs.push(l.miner_input(IDLE));
    op.outputs.push(Out { seal: None, lock: None, type_: None, data: vec![] });
    op.btc_outputs.push((546, p2wpkh(0x01)));
    let (tx, _) = op.build(&l.env);
    l.env.verify(&tx).unwrap();
}

#[test]
fn without_a_miner_cell_the_xudt_itself_refuses_to_mint() {
    let mut l = Launch::new();
    let funding = l.env.live(l.env.always_lock.clone(), None, vec![]);
    let mut op = Op::new();
    op.inputs.push((funding, None));
    op.outputs.push(Out { seal: None, lock: None, type_: Some(l.udt.clone()), data: amount(1) });
    let (tx, _) = op.build(&l.env);
    let err = l.env.verify(&tx).unwrap_err();
    assert!(err.contains("Outputs[0].Type"), "{err}");
}

#[test]
fn a_miner_cell_under_another_lock_cannot_vouch_for_a_mint() {
    let (nonce, clz) = nonce_for(MIN_CLZ, false);
    let mut l = Launch::new();
    let mut op = l.mint_op(nonce, H0, reward(clz, H0, H0).unwrap().into(), IDLE);
    // An always-success miner cell: its "witness" is whatever the attacker writes.
    op.inputs[0] = (l.env.live(l.env.always_lock.clone(), Some(l.mint.clone()), cell(ARMED, 0)), None);
    op.inputs.push((l.env.live(l.env.rgbpp_lock([0x46; 32], 0), None, vec![]), Some(([0x46; 32], 0))));
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), NOT_RGBPP_LOCK);
}

// ─── The witness the script trusts ───────────────────────────────────────

#[test]
fn a_forged_unlock_behind_a_sibling_cell_cannot_pay_for_a_ticket() {
    // A token cell and the miner cell sealed to the same UTXO share one RGB++
    // lock group. The lock verifies the first one's witness; the miner cell's
    // own witness here carries a forged Bitcoin transaction that pays the
    // promoter, while the real one does not.
    let mut l = Launch::new();
    let seal = (TICKET_TXID, TICKET_VOUT);
    let lock = l.env.rgbpp_lock(seal.0, seal.1);
    let mut op = Op::new();
    op.inputs.push((l.env.live(lock.clone(), Some(l.udt.clone()), amount(10)), Some(seal)));
    op.inputs.push((l.env.live(lock, Some(l.mint.clone()), cell(IDLE, 0)), Some(seal)));
    op.outputs.push(l.udt_out(10));
    op.outputs.push(l.miner_out(ARMED));
    op.btc_outputs.push((546, p2wpkh(0x01)));
    let forged = forged_unlock(vec![l.ticket()], seal, H0);
    op.witness_overrides.push((1, forged));
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), TICKET_UNPAID);
}

#[test]
fn one_payment_buys_one_ticket_even_across_launches() {
    // Two launches by the same promoter, both armed in one transaction.
    let mut l = Launch::new();
    let promoter = l.env.promoter.clone();
    let other_mint = l.env.mint_type(H0 + 1, &promoter);
    let mut op = Op::new();
    op.inputs.push(l.miner_input(IDLE));
    let second = l.env.rgbpp_lock([0x47; 32], 0);
    op.inputs.push((l.env.live(second, Some(other_mint.clone()), cell(IDLE, 0)), Some(([0x47; 32], 0))));
    op.outputs.push(l.miner_out(ARMED));
    op.outputs.push(Out { seal: Some(1), lock: None, type_: Some(other_mint), data: cell(ARMED, 0) });
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btc_outputs.push(l.ticket());
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), TICKET_UNPAID);

    // With two tickets paid, both arm.
    let mut l = Launch::new();
    let promoter = l.env.promoter.clone();
    let other_mint = l.env.mint_type(H0 + 1, &promoter);
    let mut op = Op::new();
    op.inputs.push(l.miner_input(IDLE));
    let second = l.env.rgbpp_lock([0x47; 32], 0);
    op.inputs.push((l.env.live(second, Some(other_mint.clone()), cell(IDLE, 0)), Some(([0x47; 32], 0))));
    op.outputs.push(l.miner_out(ARMED));
    op.outputs.push(Out { seal: Some(1), lock: None, type_: Some(other_mint), data: cell(ARMED, 0) });
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btc_outputs.push(l.ticket());
    op.btc_outputs.push(l.ticket());
    let (tx, _) = op.build(&l.env);
    l.env.verify(&tx).unwrap();
}
