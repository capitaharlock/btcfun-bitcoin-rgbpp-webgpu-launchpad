//! Closing a miner cell, and the xUDT's own guard against a mint without one.

use super::*;

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
