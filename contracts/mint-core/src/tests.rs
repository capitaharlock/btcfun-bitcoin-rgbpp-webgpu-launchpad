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
fn the_split_matches_the_vectors() {
    let v = &vectors()["split"];
    for (split, case) in [(NEW_CELL, "new_cell"), (REUSE, "reuse")] {
        assert_eq!(split.paymaster, v[case]["paymaster"].as_u64().unwrap(), "{case}");
        assert_eq!(split.platform, v[case]["platform"].as_u64().unwrap(), "{case}");
        assert_eq!(split.promoter, v[case]["promoter"].as_u64().unwrap(), "{case}");
        // Every satoshi of the ticket has one destination.
        assert_eq!(split.paymaster + split.platform + split.promoter, TICKET_SATS);
        // Each share is its own relayable P2WPKH output.
        assert!(split.platform >= 294 && split.promoter >= 294);
    }
    let c = &vectors()["constants"];
    assert_eq!(PAYMASTER_BUDGET_SATS, c["PAYMASTER_BUDGET_SATS"].as_u64().unwrap());
    assert_eq!(PLATFORM_PERCENT, c["PLATFORM_PERCENT"].as_u64().unwrap());
}

#[test]
fn a_ticket_pays_the_promoter_and_the_platform_in_full() {
    let promoter: &[u8] = &[0x00, 0x14, 9, 9];
    let other: &[u8] = &[0x00, 0x14, 8, 8];
    let platform: &[u8] = PLATFORM_SCRIPT;
    for price in [NEW_CELL, REUSE] {
        let (share, fee) = (price.promoter as i64, price.platform as i64);
        let pays = |outs: &[(i64, &[u8])], own, all| pays_tickets(outs.iter().copied(), promoter, platform, own, all, price);
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
        assert!(pays_tickets([(share + fee, platform)], platform, platform, 1, 1, price));
        assert!(!pays_tickets([(share, platform)], platform, platform, 1, 1, price));
    }
    // A new cell's payment is less than a re-arm's: it cannot stand in for one.
    let new = [(NEW_CELL.promoter as i64, promoter), (NEW_CELL.platform as i64, platform)];
    assert!(!pays_tickets(new.iter().copied(), promoter, platform, 1, 1, REUSE));
}

#[test]
fn a_txid_is_the_double_sha256_of_the_stripped_transaction() {
    // The genesis coinbase, serialized without witness; its txid displayed is
    // 4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b.
    let raw = unhex("01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000");
    let mut id = txid(&raw);
    id.reverse();
    assert_eq!(hex(&id), "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b");
}

#[test]
fn a_miner_cell_is_a_state_a_nonce_and_an_anchor() {
    let armed = MinerCell { state: MinerState::Armed, nonce: 0x0102_0304_0506_0708, anchor: 0x0a0b_0c0d, ticket: None };
    assert_eq!(MinerCell::parse(&armed.encode()), Some(armed));
    assert_eq!(*armed.encode(), [1, 8, 7, 6, 5, 4, 3, 2, 1, 0x0d, 0x0c, 0x0b, 0x0a]);
    assert_eq!(MinerCell::parse(&[0; 13]).map(|c| c.state), Some(MinerState::Idle));
    assert_eq!(MinerCell::parse(&[]), None);
    assert_eq!(MinerCell::parse(&[0; 12]), None);
    assert_eq!(MinerCell::parse(&[0; 14]), None);
    let paid = MinerCell { state: MinerState::Paid, nonce: 0, anchor: 0, ticket: None };
    assert_eq!(MinerCell::parse(&paid.encode()), Some(paid));
    // Only an armed cell names its ticket.
    let named = MinerCell { ticket: Some([7; 32]), ..armed };
    assert_eq!(named.encode().len(), 45);
    assert_eq!(&named.encode()[13..], &[7; 32]);
    assert_eq!(MinerCell::parse(&named.encode()), Some(named));
    let mut idle_named = named.encode().to_vec();
    idle_named[0] = 0;
    assert_eq!(MinerCell::parse(&idle_named), None);
    assert_eq!(MinerCell::parse(&[1; 44]), None);
    let mut bad = [0u8; 13];
    bad[0] = 3;
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

#[test]
fn an_admission_is_the_platform_signature_over_the_terms_and_the_registration() {
    let v = &vectors()["admission"];
    let args = unhex(v["args"].as_str().unwrap());
    let registration: [u8; 32] = unhex(v["registration"].as_str().unwrap()).try_into().unwrap();
    let signature = unhex(v["signature"].as_str().unwrap());
    let key: [u8; 32] = unhex(v["key"].as_str().unwrap()).try_into().unwrap();
    assert_eq!(key, TEST_CERT_KEY);
    assert_eq!(hex(&certificate_message(&args, &registration)), v["message"].as_str().unwrap());
    assert_eq!(hex(&registration_commitment(&args)), v["commitment"].as_str().unwrap());
    assert_eq!(REGISTRATION_SATS, v["registration_sats"].as_u64().unwrap());

    let admission = [registration.as_slice(), &signature].concat();
    assert!(admitted(&args, &admission, &key));
    // Other terms, another registration, a forged signature, another key, a short blob: refused.
    let mut other = args.clone();
    other[1] ^= 1;
    assert!(!admitted(&other, &admission, &key));
    let mut moved = admission.clone();
    moved[0] ^= 1;
    assert!(!admitted(&args, &moved, &key));
    let mut forged = admission.clone();
    forged[95] ^= 1;
    assert!(!admitted(&args, &forged, &key));
    assert!(!admitted(&args, &admission, &PLATFORM_CERT_KEY));
    assert!(!admitted(&args, &admission[..95], &key));
}
