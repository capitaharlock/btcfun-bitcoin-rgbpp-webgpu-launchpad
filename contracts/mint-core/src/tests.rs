extern crate std;

use super::*;
use std::{string::{String, ToString}, vec::Vec};

fn vectors() -> serde_json::Value {
    serde_json::from_str(include_str!("../../vectors/reward.json")).unwrap()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| std::format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Vec<u8> {
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

#[test]
fn reproduces_every_reward_vector() {
    for v in vectors()["reward"].as_array().unwrap() {
        let clz = v["clz"].as_u64().unwrap() as u32;
        let h0 = v["h0"].as_u64().unwrap() as u32;
        let height = v["height"].as_u64().unwrap() as u32;
        let expected: u64 = v["reward"].as_str().unwrap().parse().unwrap();
        assert_eq!(reward(clz, h0, height).unwrap_or(0), expected, "clz {clz} at {height}");
    }
}

#[test]
fn constants_match_the_vectors() {
    let c = &vectors()["constants"];
    assert_eq!(UNIT.to_string(), c["UNIT"].as_str().unwrap());
    assert_eq!(u64::from(HALVING_BLOCKS), c["HALVING_BLOCKS"].as_u64().unwrap());
    assert_eq!(u64::from(MIN_CLZ), c["MIN_CLZ"].as_u64().unwrap());
    assert_eq!(TICKET_SATS, c["TICKET_SATS"].as_u64().unwrap());
}

#[test]
fn invalid_mints_are_refused_not_priced_at_zero() {
    assert_eq!(reward(MIN_CLZ - 1, 0, 0), None);
    assert_eq!(reward(40, 100, 99), None);
    assert_eq!(reward(256, 0, 43 * HALVING_BLOCKS), Some(0));
    assert_eq!(reward(256, 0, u32::MAX), Some(0));
}

#[test]
fn reproduces_the_challenge_and_work_vectors() {
    for t in vectors()["challenge"].as_array().unwrap() {
        let mut txid: [u8; 32] = unhex(t["txid"].as_str().unwrap()).try_into().unwrap();
        txid.reverse(); // displayed order → internal order
        let challenge = ticket_challenge(&txid, t["vout"].as_u64().unwrap() as u32);
        assert_eq!(hex(&challenge), t["challenge"].as_str().unwrap());
        let nonce: u64 = t["nonce"].as_str().unwrap().parse().unwrap();
        assert_eq!(u64::from(work_clz(&challenge, nonce)), t["clz"].as_u64().unwrap());
    }
}

fn terms(script: &[u8]) -> Vec<u8> {
    let mut args = std::vec![TERMS_VERSION];
    args.extend_from_slice(&150_000u32.to_le_bytes());
    args.extend_from_slice(&[7u8; 32]);
    args.push(script.len() as u8);
    args.extend_from_slice(script);
    args
}

#[test]
fn parses_launch_terms_exactly() {
    let p2wpkh = [0x00, 0x14, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    let args = terms(&p2wpkh);
    let parsed = LaunchTerms::parse(&args).unwrap();
    assert_eq!(parsed.h0, 150_000);
    assert_eq!(parsed.promoter_script, &p2wpkh);

    let mut longer = args.clone();
    longer.push(0);
    assert_eq!(LaunchTerms::parse(&longer), Err(TermsError::TrailingBytes));
    assert_eq!(LaunchTerms::parse(&args[..args.len() - 1]), Err(TermsError::Truncated));
    let mut wrong = args.clone();
    wrong[0] = 2;
    assert_eq!(LaunchTerms::parse(&wrong), Err(TermsError::UnknownVersion));
    assert_eq!(LaunchTerms::parse(&terms(&[])), Err(TermsError::PromoterScript));
    assert_eq!(LaunchTerms::parse(&terms(&[0u8; 35])), Err(TermsError::PromoterScript));
}

#[test]
fn a_ticket_pays_the_promoter_and_the_platform_in_full() {
    let promoter: &[u8] = &[0x00, 0x14, 9, 9];
    let other: &[u8] = &[0x00, 0x14, 8, 8];
    let platform: &[u8] = PLATFORM_SCRIPT;
    let (share, fee) = (PROMOTER_SATS as i64, PLATFORM_FEE_SATS as i64);
    assert_eq!(PROMOTER_SATS + PLATFORM_FEE_SATS, TICKET_SATS);
    assert_eq!(PLATFORM_FEE_SATS * 20, TICKET_SATS);
    // Both shares survive Bitcoin's P2WPKH dust limit on their own.
    assert!(PLATFORM_FEE_SATS >= 294);
    let pays = |outs: &[(i64, &[u8])], own, all| pays_tickets(outs.iter().copied(), promoter, platform, own, all);
    assert!(pays(&[(share, promoter), (fee, platform)], 1, 1));
    assert!(!pays(&[(share - 1, promoter), (fee, platform)], 1, 1));
    assert!(!pays(&[(share, promoter), (fee - 1, platform)], 1, 1));
    assert!(!pays(&[(share, other), (fee, platform)], 1, 1));
    assert!(!pays(&[(share + fee, promoter)], 1, 1));
    // Two tickets need two tickets' worth, in one output or several.
    assert!(!pays(&[(share, promoter), (fee, platform)], 2, 2));
    assert!(pays(&[(share, promoter), (share, promoter), (2 * fee, platform)], 2, 2));
    // Another promoter's ticket in the same transaction owes the platform too.
    assert!(!pays(&[(share, promoter), (fee, platform)], 1, 2));
    // A promoter who is the platform owes both shares to the one script.
    assert!(pays_tickets([(share + fee, platform)], platform, platform, 1, 1));
    assert!(!pays_tickets([(share, platform)], platform, platform, 1, 1));
}

#[test]
fn a_miner_cell_is_a_state_a_nonce_and_an_anchor() {
    let armed = MinerCell { state: MinerState::Armed, nonce: 0x0102_0304_0506_0708, anchor: 0x0a0b_0c0d };
    assert_eq!(MinerCell::parse(&armed.encode()), Some(armed));
    assert_eq!(armed.encode(), [1, 8, 7, 6, 5, 4, 3, 2, 1, 0x0d, 0x0c, 0x0b, 0x0a]);
    assert_eq!(MinerCell::parse(&[0; 13]).map(|c| c.state), Some(MinerState::Idle));
    assert_eq!(MinerCell::parse(&[]), None);
    assert_eq!(MinerCell::parse(&[0; 12]), None);
    assert_eq!(MinerCell::parse(&[0; 14]), None);
    let mut bad = [0u8; 13];
    bad[0] = 2;
    assert_eq!(MinerCell::parse(&bad), None);
}

#[test]
fn an_anchor_is_at_or_shortly_before_the_confirming_block() {
    assert!(anchor_valid(1000, 1000, 1000));
    assert!(anchor_valid(1000, 1000, 1000 + ANCHOR_GRACE_BLOCKS));
    assert!(!anchor_valid(1000, 1000, 1001 + ANCHOR_GRACE_BLOCKS));
    assert!(!anchor_valid(1001, 1000, 1000), "an anchor after confirmation");
    assert!(!anchor_valid(999, 1000, 1005), "an anchor before the launch opens");
}
