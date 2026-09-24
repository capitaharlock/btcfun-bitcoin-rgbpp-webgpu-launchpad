//! Only a launch btc.fun certified takes a miner in.

use super::*;

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
