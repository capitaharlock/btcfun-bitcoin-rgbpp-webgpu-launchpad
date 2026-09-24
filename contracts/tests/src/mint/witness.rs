//! The witness the script trusts: only the unlock the RGB++ lock verifies, and one
//! payment per ticket.

use super::*;

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
