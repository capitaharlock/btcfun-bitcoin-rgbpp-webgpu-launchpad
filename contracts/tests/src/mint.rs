//! Every transition of the miner cell, and every way to cheat one.

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

// ─── Open ────────────────────────────────────────────────────────────────

#[test]
fn nobody_opens_an_idle_miner_cell() {
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
    expect_code(l.env.verify(&tx), OPENED_IDLE);
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
    op.btc_outputs.extend(l.ticket());
    let (tx, _) = op.build(&l.env);
    let cycles = l.env.verify(&tx).unwrap();
    println!("ticket: {cycles} cycles");
}

#[test]
fn an_unpaid_underpaid_or_misdirected_ticket_is_refused() {
    let promoter = || Launch::new().env.promoter;
    let platform = || PLATFORM_SCRIPT.to_vec();
    let (share, fee) = (PROMOTER_SATS as i64, PLATFORM_FEE_SATS as i64);
    let cases: [Vec<(i64, Vec<u8>)>; 6] = [
        vec![],
        vec![(share, promoter())],
        vec![(fee, platform())],
        vec![(share - 1, promoter()), (fee, platform())],
        vec![(share, promoter()), (fee - 1, platform())],
        vec![(share, p2wpkh(0xbb)), (fee, platform())],
    ];
    for payments in cases {
        let mut l = Launch::new();
        let mut op = Op::new();
        op.inputs.push(l.miner_input(IDLE));
        op.outputs.push(l.miner_out(ARMED));
        op.btc_outputs.push((546, p2wpkh(0x01)));
        op.btc_outputs.extend(payments);
        let (tx, _) = op.build(&l.env);
        expect_code(l.env.verify(&tx), TICKET_UNPAID);
    }
}

#[test]
fn the_platform_is_paid_for_every_launch_armed_in_one_transaction() {
    // Two launches by different promoters: each promoter is paid in full, but
    // the platform's fee covers only one of the two tickets.
    let mut l = Launch::new();
    let other_promoter = p2wpkh(0xcc);
    let other_mint = l.env.mint_type(H0 + 1, &other_promoter);
    let build = |l: &mut Launch, fees: i64| {
        let mut op = Op::new();
        op.inputs.push(l.miner_input(IDLE));
        let second = l.env.rgbpp_lock([0x48; 32], 0);
        op.inputs.push((l.env.live(second, Some(other_mint.clone()), cell(IDLE, 0)), Some(([0x48; 32], 0))));
        op.outputs.push(l.miner_out(ARMED));
        op.outputs.push(Out { seal: Some(1), lock: None, type_: Some(other_mint.clone()), data: anchored(ARMED, 0, H0 + 1) });
        op.height = H0 + 1;
        op.btc_outputs.push((546, p2wpkh(0x01)));
        op.btc_outputs.push((PROMOTER_SATS as i64, l.env.promoter.clone()));
        op.btc_outputs.push((PROMOTER_SATS as i64, other_promoter.clone()));
        op.btc_outputs.push((fees * PLATFORM_FEE_SATS as i64, PLATFORM_SCRIPT.to_vec()));
        op.build(&l.env).0
    };
    let tx = build(&mut l, 1);
    expect_code(l.env.verify(&tx), TICKET_UNPAID);
    let tx = build(&mut l, 2);
    l.env.verify(&tx).unwrap();
}

#[test]
fn a_promoter_who_is_the_platform_owes_the_whole_ticket() {
    let mut l = Launch::new();
    l.env.promoter = PLATFORM_SCRIPT.to_vec();
    l.mint = l.env.mint_type(H0, &PLATFORM_SCRIPT.to_vec());
    l.udt = l.env.xudt_type(&l.mint);
    for (paid, ok) in [(PROMOTER_SATS as i64, false), ((PROMOTER_SATS + PLATFORM_FEE_SATS) as i64, true)] {
        let mut op = Op::new();
        op.inputs.push(l.miner_input(IDLE));
        op.outputs.push(l.miner_out(ARMED));
        op.btc_outputs.push((546, p2wpkh(0x01)));
        op.btc_outputs.push((paid, PLATFORM_SCRIPT.to_vec()));
        let (tx, _) = op.build(&l.env);
        if ok { l.env.verify(&tx).unwrap(); } else { expect_code(l.env.verify(&tx), TICKET_UNPAID); }
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
    op.btc_outputs.extend(l.ticket());
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
fn the_reward_is_priced_at_the_tickets_anchor_whenever_the_mint_confirms() {
    let (nonce, clz) = nonce_for(MIN_CLZ, false);
    let full = u128::from(reward(clz, H0, H0).unwrap());
    let anchor = H0 + 2 * HALVING_BLOCKS;
    let much_later = H0 + 10 * HALVING_BLOCKS;

    // A ticket bought after two halvings mints a quarter, even if the mint
    // itself confirms weeks later — the confirmation height is irrelevant.
    let mut l = Launch::new();
    let mut op = l.mint_op(nonce, much_later, full / 4, IDLE);
    op.inputs[0] = l.miner_input_at(ARMED, anchor);
    let (tx, _) = op.build(&l.env);
    l.env.verify(&tx).unwrap();

    let mut l = Launch::new();
    let mut op = l.mint_op(nonce, much_later, full, IDLE);
    op.inputs[0] = l.miner_input_at(ARMED, anchor);
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), WRONG_AMOUNT);
}

#[test]
fn a_ticket_is_anchored_at_most_a_day_before_it_confirms() {
    let confirmed = H0 + 500;
    for (anchor, valid) in [
        (confirmed, true),
        (confirmed - ANCHOR_GRACE_BLOCKS, true),
        (confirmed - ANCHOR_GRACE_BLOCKS - 1, false),
        (confirmed + 1, false),
        (H0 - 1, false),
    ] {
        let mut l = Launch::new();
        let mut op = Op::new();
        op.inputs.push(l.miner_input(IDLE));
        op.outputs.push(l.miner_out_anchored(ARMED, anchor));
        op.btc_outputs.push((546, p2wpkh(0x01)));
        op.btc_outputs.extend(l.ticket());
        op.height = confirmed;
        let (tx, _) = op.build(&l.env);
        let result = l.env.verify(&tx);
        if valid {
            result.unwrap();
        } else {
            expect_code(result, BAD_ANCHOR);
        }
    }
}

#[test]
fn a_weak_hash_mints_nothing() {
    let mut l = Launch::new();
    let (nonce, _) = nonce_for(MIN_CLZ, true);
    let (tx, _) = l.mint_op(nonce, H0, 1, IDLE).build(&l.env);
    expect_code(l.env.verify(&tx), WORK_TOO_WEAK);
}

#[test]
fn nothing_is_minted_for_a_ticket_anchored_before_the_launch_opens() {
    // Arming refuses such an anchor; this cell could only exist by other means.
    let mut l = Launch::new();
    let (nonce, clz) = nonce_for(MIN_CLZ, false);
    let atoms = reward(clz, H0, H0).unwrap();
    let mut op = l.mint_op(nonce, H0, atoms.into(), IDLE);
    op.inputs[0] = l.miner_input_at(ARMED, H0 - 1);
    let (tx, _) = op.build(&l.env);
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
fn a_mint_cannot_buy_the_next_ticket() {
    // Even paid, re-arming in the mint would make a transaction that carries
    // the balance depend on when it confirms. The next ticket is separate.
    let (nonce, clz) = nonce_for(MIN_CLZ, false);
    let atoms = reward(clz, H0, H0).unwrap();
    let mut l = Launch::new();
    let mut op = l.mint_op(nonce, H0, atoms.into(), ARMED);
    op.btc_outputs.extend(l.ticket());
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), MINT_MUST_DISARM);
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
    op.btc_outputs.extend(l.ticket());
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), TOO_MANY_MINER_CELLS);
}

// ─── Close, and the xUDT's own guard ─────────────────────────────────────

#[test]
fn closing_a_miner_cell_cannot_mint() {
    // Armed: a balance appearing is a dissolving mint, which needs its nonce.
    let mut l = Launch::new();
    let mut op = Op::new();
    op.inputs.push(l.miner_input(ARMED));
    op.outputs.push(l.udt_out(1));
    op.btc_outputs.push((546, p2wpkh(0x01)));
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), BAD_BTCFUN_WITNESS);
    // Idle or paid: nothing may be minted at all.
    for state in [IDLE, PAID] {
        let mut l = Launch::new();
        let mut op = Op::new();
        op.inputs.push(l.miner_input(state));
        op.outputs.push(l.udt_out(1));
        op.btc_outputs.push((546, p2wpkh(0x01)));
        let (tx, _) = op.build(&l.env);
        expect_code(l.env.verify(&tx), BALANCE_INCREASED);
    }
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
    let forged = forged_unlock(l.ticket().to_vec(), seal, H0);
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
    op.outputs.push(Out { seal: Some(1), lock: None, type_: Some(other_mint), data: anchored(ARMED, 0, H0 + 1) });
    op.height = H0 + 1;
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btc_outputs.extend(l.ticket());
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
    op.outputs.push(Out { seal: Some(1), lock: None, type_: Some(other_mint), data: anchored(ARMED, 0, H0 + 1) });
    op.height = H0 + 1;
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btc_outputs.extend(l.ticket());
    op.btc_outputs.extend(l.ticket());
    let (tx, _) = op.build(&l.env);
    l.env.verify(&tx).unwrap();
}

// ─── A ticket that creates its miner cell ────────────────────────────────

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

#[test]
fn anyone_can_open_a_paid_cell_but_not_beside_an_rgbpp_input() {
    let mut l = Launch::new();
    let funding = l.env.live(l.env.always_lock.clone(), None, vec![]);
    let mut op = Op::new();
    op.inputs.push((funding, None));
    op.outputs.push(Out { seal: None, lock: Some(l.env.rgbpp_lock([0x33; 32], 1)), type_: Some(l.mint.clone()), data: cell(PAID, 0) });
    let (tx, _) = op.build(&l.env);
    l.env.verify(&tx).unwrap();

    // The same Bitcoin transaction also spending sealed cells — here re-arming
    // one — could lend that ticket's payment to the paid cell later.
    let mut l = Launch::new();
    let other_mint = l.env.mint_type(H0 + 1, &l.env.promoter.clone());
    let mut op = Op::new();
    op.inputs.push(l.miner_input(IDLE));
    op.outputs.push(l.miner_out(ARMED));
    op.outputs.push(Out { seal: Some(1), lock: None, type_: Some(other_mint), data: cell(PAID, 0) });
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btc_outputs.extend(l.ticket());
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), PAID_BESIDE_RGBPP_INPUT);
}

#[test]
fn a_paid_cell_is_armed_by_the_payment_that_created_it() {
    let mut l = Launch::new();
    let payments = new_cell_ticket(&l);
    let (tx, _) = l.arm_paid(payments, Some).build(&l.env);
    let cycles = l.env.verify(&tx).unwrap();
    println!("arm a paid cell: {cycles} cycles");
}

#[test]
fn an_underpaid_creation_arms_nothing() {
    let promoter = Launch::new().env.promoter;
    let platform = PLATFORM_SCRIPT.to_vec();
    let (share, fee) = (NEW_CELL.promoter as i64, NEW_CELL.platform as i64);
    for payments in [
        vec![],
        vec![(share - 1, promoter.clone()), (fee, platform.clone())],
        vec![(share, promoter.clone()), (fee - 1, platform.clone())],
        vec![(share, p2wpkh(0xbb)), (fee, platform.clone())],
    ] {
        let mut l = Launch::new();
        let (tx, _) = l.arm_paid(payments, Some).build(&l.env);
        expect_code(l.env.verify(&tx), TICKET_UNPAID);
    }
}

#[test]
fn the_creating_transaction_must_be_the_one_the_seal_names() {
    // No witness at all.
    let mut l = Launch::new();
    let payments = new_cell_ticket(&l);
    let (tx, _) = l.arm_paid(payments, |_| None).build(&l.env);
    expect_code(l.env.verify(&tx), BAD_BTCFUN_WITNESS);

    // Another transaction that pays in full, but is not the one the cell is sealed to.
    let mut l = Launch::new();
    let payments = new_cell_ticket(&l);
    let (other, _) = creating_tx([payments.clone(), vec![(1, p2wpkh(0x02))]].concat());
    let (tx, _) = l.arm_paid(payments, |_| Some(other)).build(&l.env);
    expect_code(l.env.verify(&tx), BAD_PAID_SEAL);

    // The right transaction, but the cell sealed to an output a ticket does not seal.
    let mut l = Launch::new();
    let (raw, id) = creating_tx(new_cell_ticket(&l));
    let mut op = Op::new();
    op.inputs.push(l.paid_input(id, 2));
    op.outputs.push(Out { seal: Some(1), lock: None, type_: Some(l.mint.clone()), data: naming(H0, id) });
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btcfun_witness = Some(Bytes::from([admission(&l.mint, &mint_core::TEST_CERT_SECRET), raw.to_vec()].concat()));
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), BAD_PAID_SEAL);
}

#[test]
fn a_paid_cell_is_anchored_like_any_ticket() {
    let confirmed = H0 + 500;
    for (anchor, valid) in [(confirmed, true), (confirmed - ANCHOR_GRACE_BLOCKS - 1, false)] {
        let mut l = Launch::new();
        let payments = new_cell_ticket(&l);
        let mut op = l.arm_paid(payments, Some);
        let seal = op.inputs[0].1.unwrap().0;
        op.outputs[0].data = naming(anchor, seal);
        op.height = confirmed;
        let (tx, _) = op.build(&l.env);
        if valid { l.env.verify(&tx).unwrap(); } else { expect_code(l.env.verify(&tx), BAD_ANCHOR); }
    }
}

#[test]
fn a_paid_cell_cannot_move_and_nothing_becomes_paid() {
    for next in [PAID, IDLE] {
        let mut l = Launch::new();
        let payments = new_cell_ticket(&l);
        let mut op = l.arm_paid(payments, Some);
        op.outputs[0] = l.miner_out(next);
        let (tx, _) = op.build(&l.env);
        expect_code(l.env.verify(&tx), PAID_CANNOT_MOVE);
    }
    let mut l = Launch::new();
    let mut op = Op::new();
    op.inputs.push(l.miner_input(IDLE));
    op.outputs.push(l.miner_out(PAID));
    op.btc_outputs.push((546, p2wpkh(0x01)));
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), 3); // BadMinerState
}

#[test]
fn a_paid_cell_is_armed_alone() {
    // An armed cell of another launch minting in the same transaction: its
    // ticket's payment must not be the one the paid cell claims.
    let mut l = Launch::new();
    let other_mint = l.env.mint_type(H0 + 1, &l.env.promoter.clone());
    let payments = new_cell_ticket(&l);
    let mut op = l.arm_paid(payments, Some);
    // Sealed to the same output as the paid cell: the case where it would pay.
    let seal = op.inputs[0].1.unwrap();
    let lock = l.env.rgbpp_lock(seal.0, seal.1);
    // An idle cell moved alongside: valid on its own, so only the paid cell's
    // rule can refuse the transaction.
    op.inputs.push((l.env.live(lock, Some(other_mint.clone()), cell(IDLE, 0)), Some(seal)));
    op.outputs.push(Out { seal: Some(2), lock: None, type_: Some(other_mint), data: cell(IDLE, 0) });
    op.btc_outputs.push((546, p2wpkh(0x01)));
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), PAID_ARMED_BESIDE_OTHERS);
}

#[test]
fn a_new_cells_payment_does_not_rearm_an_idle_cell() {
    let mut l = Launch::new();
    let mut op = Op::new();
    op.inputs.push(l.miner_input(IDLE));
    op.outputs.push(l.miner_out(ARMED));
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btc_outputs.extend(new_cell_ticket(&l));
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), TICKET_UNPAID);
}

// ─── A first mint dissolves the miner cell ───────────────────────────────

#[test]
fn a_first_mint_turns_the_miner_cell_into_the_token_cell() {
    let (nonce, clz) = nonce_for(MIN_CLZ, false);
    let atoms = u128::from(reward(clz, H0, H0).unwrap());
    let mut l = Launch::new();
    let mut op = Op::new();
    op.inputs.push(l.miner_input(ARMED));
    op.outputs.push(l.udt_out(atoms));
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btcfun_witness = Some(Bytes::from(nonce.to_le_bytes().to_vec()));
    let (tx, _) = op.build(&l.env);
    let cycles = l.env.verify(&tx).unwrap();
    println!("dissolving mint: {cycles} cycles");
}

#[test]
fn a_dissolving_mint_is_checked_like_any_mint() {
    let (strong, clz) = nonce_for(MIN_CLZ, false);
    let (weak, _) = nonce_for(MIN_CLZ, true);
    let atoms = u128::from(reward(clz, H0, H0).unwrap());
    for (nonce, claimed, code) in [
        (weak.to_le_bytes().to_vec(), atoms, WORK_TOO_WEAK),
        (strong.to_le_bytes().to_vec(), atoms + 1, WRONG_AMOUNT),
        (strong.to_le_bytes()[..7].to_vec(), atoms, BAD_BTCFUN_WITNESS),
    ] {
        let mut l = Launch::new();
        let mut op = Op::new();
        op.inputs.push(l.miner_input(ARMED));
        op.outputs.push(l.udt_out(claimed));
        op.btc_outputs.push((546, p2wpkh(0x01)));
        op.btcfun_witness = Some(Bytes::from(nonce));
        let (tx, _) = op.build(&l.env);
        expect_code(l.env.verify(&tx), code);
    }
}

// ─── Mining on a ticket before it is armed ───────────────────────────────

#[test]
fn a_paid_cell_is_armed_naming_its_ticket_and_nothing_else() {
    // Not naming it, or naming another transaction.
    for data in [cell(ARMED, 0), naming(H0, [0x44; 32])] {
        let mut l = Launch::new();
        let payments = new_cell_ticket(&l);
        let mut op = l.arm_paid(payments, Some);
        op.outputs[0].data = data;
        let (tx, _) = op.build(&l.env);
        expect_code(l.env.verify(&tx), BAD_TICKET_NAME);
    }
    // Re-arming an idle cell mines on its own seal: it may not name a ticket.
    let mut l = Launch::new();
    let mut op = Op::new();
    op.inputs.push(l.miner_input(IDLE));
    op.outputs.push(Out { seal: Some(1), lock: None, type_: Some(l.mint.clone()), data: naming(H0, TICKET_TXID) });
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btc_outputs.extend(l.ticket());
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), BAD_TICKET_NAME);
}

#[test]
fn a_cell_armed_from_paid_mints_on_its_tickets_output() {
    // The input cell is sealed to the arming transaction's output, and names
    // the ticket: the work must be against the ticket, not the seal.
    let arming = [0x55; 32];
    let (nonce, clz) = nonce_for(MIN_CLZ, false);
    let atoms = u128::from(reward(clz, H0, H0).unwrap());
    let run = |named: [u8; 32]| {
        let mut l = Launch::new();
        let lock = l.env.rgbpp_lock(arming, 1);
        let input = l.env.live(lock, Some(l.mint.clone()), naming(H0, named));
        let mut op = Op::new();
        op.inputs.push((input, Some((arming, 1))));
        op.outputs.push(l.udt_out(atoms));
        op.btc_outputs.push((546, p2wpkh(0x01)));
        op.btcfun_witness = Some(Bytes::from(nonce.to_le_bytes().to_vec()));
        let (tx, _) = op.build(&l.env);
        l.env.verify(&tx)
    };
    run(TICKET_TXID).unwrap();
    // The same nonce against the seal it was not mined on is (almost surely) weak.
    let seal_clz = work_clz(&ticket_challenge(&arming, 1), nonce);
    if seal_clz < MIN_CLZ {
        expect_code(run(arming), WORK_TOO_WEAK);
    }
}

// ─── Only a launch btc.fun certified takes a miner in ────────────────────

#[test]
fn a_paid_cell_of_an_uncertified_launch_is_never_armed() {
    for (label, secret, cut) in [("another key", [0x11; 32], false), ("no admission", mint_core::TEST_CERT_SECRET, true)] {
        let mut l = Launch::new();
        let payments = new_cell_ticket(&l);
        let (raw, id) = creating_tx(payments);
        let mut op = Op::new();
        op.inputs.push(l.paid_input(id, 1));
        op.outputs.push(Out { seal: Some(1), lock: None, type_: Some(l.mint.clone()), data: naming(H0, id) });
        op.btc_outputs.push((546, p2wpkh(0x01)));
        let admission = if cut { vec![] } else { admission(&l.mint, &secret) };
        op.btcfun_witness = Some(Bytes::from([admission, raw.to_vec()].concat()));
        let (tx, _) = op.build(&l.env);
        expect_code(l.env.verify(&tx), NOT_CERTIFIED);
        let _ = label;
    }
    // Nor one over no registration at all: the platform's own launches once
    // went unpaid under an all-zero txid, and those certificates are dead.
    let mut l = Launch::new();
    let payments = new_cell_ticket(&l);
    let (raw, id) = creating_tx(payments);
    let mut op = Op::new();
    op.inputs.push(l.paid_input(id, 1));
    op.outputs.push(Out { seal: Some(1), lock: None, type_: Some(l.mint.clone()), data: naming(H0, id) });
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btcfun_witness = Some(Bytes::from([admission_over(&l.mint, &mint_core::TEST_CERT_SECRET, [0; 32]), raw.to_vec()].concat()));
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), NOT_CERTIFIED);
    // A certificate for another launch's terms does not carry over.
    let mut l = Launch::new();
    let other = l.env.mint_type(H0 + 1, &l.env.promoter.clone());
    let payments = new_cell_ticket(&l);
    let (raw, id) = creating_tx(payments);
    let mut op = Op::new();
    op.inputs.push(l.paid_input(id, 1));
    op.outputs.push(Out { seal: Some(1), lock: None, type_: Some(l.mint.clone()), data: naming(H0, id) });
    op.btc_outputs.push((546, p2wpkh(0x01)));
    op.btcfun_witness = Some(Bytes::from([admission(&other, &mint_core::TEST_CERT_SECRET), raw.to_vec()].concat()));
    let (tx, _) = op.build(&l.env);
    expect_code(l.env.verify(&tx), NOT_CERTIFIED);
}
