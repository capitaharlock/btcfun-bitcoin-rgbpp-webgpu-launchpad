//! Mining on a ticket before it is armed: the arming names the ticket the work was
//! done against.

use super::*;

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
