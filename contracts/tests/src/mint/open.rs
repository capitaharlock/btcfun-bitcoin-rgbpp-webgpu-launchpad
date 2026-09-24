//! Opening a miner cell: never idle, never armed, always bound to Bitcoin.

use super::*;

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
