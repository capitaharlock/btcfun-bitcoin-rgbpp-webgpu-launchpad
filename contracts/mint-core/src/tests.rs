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
fn a_ticket_must_pay_the_promoter_in_full() {
    let promoter: &[u8] = &[0x00, 0x14, 9, 9];
    let other: &[u8] = &[0x00, 0x14, 8, 8];
    assert!(pays_ticket([(TICKET_SATS as i64, promoter)], promoter));
    assert!(!pays_ticket([(TICKET_SATS as i64 - 1, promoter)], promoter));
    assert!(!pays_ticket([(TICKET_SATS as i64, other)], promoter));
}

#[test]
fn a_miner_cell_is_a_state_and_a_nonce_and_nothing_else() {
    let armed = MinerCell { state: MinerState::Armed, nonce: 0x0102_0304_0506_0708 };
    assert_eq!(MinerCell::parse(&armed.encode()), Some(armed));
    assert_eq!(armed.encode(), [1, 8, 7, 6, 5, 4, 3, 2, 1]);
    assert_eq!(MinerCell::parse(&[0; 9]).map(|c| c.state), Some(MinerState::Idle));
    assert_eq!(MinerCell::parse(&[]), None);
    assert_eq!(MinerCell::parse(&[0; 8]), None);
    assert_eq!(MinerCell::parse(&[0; 10]), None);
    assert_eq!(MinerCell::parse(&[2, 0, 0, 0, 0, 0, 0, 0, 0]), None);
}
