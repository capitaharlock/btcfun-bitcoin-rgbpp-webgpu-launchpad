//! A first mint dissolves the miner cell into the token cell.

use super::*;

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
