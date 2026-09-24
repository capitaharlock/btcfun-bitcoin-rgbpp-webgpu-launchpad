//! Minting: the standard reward for valid work, priced at the ticket's anchor, and
//! nothing for weak, stale or borrowed work.

use super::*;

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
