//! Arming a cell with a ticket: who must be paid, and how much.

use super::*;

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
