//! A ticket that creates its miner cell: the paid cell and its arming by the
//! payment that created it.

use super::*;

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
