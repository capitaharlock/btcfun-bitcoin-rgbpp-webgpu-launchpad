//! The standard tokenomics — `PROTOCOL.md` §4.
//!
//! Everything the mint script decides that does not need a chain API lives
//! here, so it runs and is tested on the host against the same vectors as the
//! browser (`contracts/vectors/reward.json`). The script crate only gathers
//! inputs from the transaction and calls these functions.

#![no_std]

use sha2::{Digest, Sha256};

/// Atoms minted per `clz²` before any halving: one whole token at 8 decimals.
pub const UNIT: u64 = 100_000_000;
/// Bitcoin blocks between halvings, about one week.
pub const HALVING_BLOCKS: u32 = 1008;
/// Smallest mintable result.
pub const MIN_CLZ: u32 = 16;
/// Price of one ticket, in satoshis, split between the promoter and the platform.
pub const TICKET_SATS: u64 = 10_000;
/// The platform's share of a ticket: 5 %. A share of a 5,000-sat ticket would
/// fall below Bitcoin's dust limit and could not be relayed as its own output.
pub const PLATFORM_FEE_SATS: u64 = TICKET_SATS / 20;
/// The promoter's share of a ticket.
pub const PROMOTER_SATS: u64 = TICKET_SATS - PLATFORM_FEE_SATS;
/// The platform's fee output: P2WPKH `tb1q7hq7fdm88ewl4g6g7l865ltnau9f0ga76e6gye`
/// on Bitcoin testnet3. Fixed in the script, not in the launch terms, so no
/// launch can redirect it. A mainnet build must replace it.
pub const PLATFORM_SCRIPT: &[u8] = &[
    0x00, 0x14, 0xf5, 0xc1, 0xe4, 0xb7, 0x67, 0x3e, 0x5d, 0xfa, 0xa3, 0x48, 0xf7, 0xcf, 0xaa, 0x7d, 0x73, 0xef,
    0x0a, 0x97, 0xa3, 0xbe,
];
/// How far behind its confirming block a ticket's declared anchor may be.
pub const ANCHOR_GRACE_BLOCKS: u32 = 144;

/// Atoms one ticket mints for a hash with `clz` leading zero bits, for a ticket
/// anchored at Bitcoin height `height`, in a launch that opened at `h0`.
///
/// `None` when the mint is not valid at all — before the launch opens, or below
/// the minimum — which callers must reject rather than treat as a zero mint.
/// `UNIT × clz²` is below 2^43 for every possible `clz`, so the product cannot
/// overflow, and a shift of 64 or more is the terminal zero, not a panic.
pub fn reward(clz: u32, h0: u32, height: u32) -> Option<u64> {
    if clz < MIN_CLZ || clz > 256 || height < h0 {
        return None;
    }
    let k = (height - h0) / HALVING_BLOCKS;
    let minted = UNIT * u64::from(clz) * u64::from(clz);
    Some(minted.checked_shr(k).unwrap_or(0))
}

/// The 32-byte mining challenge of a ticket outpoint: `sha256(txid ‖ vout_le)`,
/// with the txid in internal byte order, as it appears in a Bitcoin input.
pub fn ticket_challenge(txid: &[u8; 32], vout: u32) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(txid);
    hasher.update(vout.to_le_bytes());
    hasher.finalize().into()
}

/// Leading zero bits of `sha256d(challenge ‖ nonce_le64)`.
pub fn work_clz(challenge: &[u8; 32], nonce: u64) -> u32 {
    let mut preimage = [0u8; 40];
    preimage[..32].copy_from_slice(challenge);
    preimage[32..].copy_from_slice(&nonce.to_le_bytes());
    let digest: [u8; 32] = Sha256::digest(Sha256::digest(preimage)).into();
    leading_zero_bits(&digest)
}

fn leading_zero_bits(bytes: &[u8]) -> u32 {
    let mut total = 0;
    for byte in bytes {
        if *byte == 0 {
            total += 8;
        } else {
            return total + byte.leading_zeros();
        }
    }
    total
}

/// Why a set of launch terms or a miner cell was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TermsError {
    UnknownVersion,
    Truncated,
    PromoterScript,
    TrailingBytes,
}

/// The launch terms carried in the mint script's args. They are the launch's
/// identity: the xUDT's owner is the hash of the script that carries them, so
/// changing any term makes a different token.
///
/// ```text
/// version u8 = 1 | h0 u32 LE | metadata hash [32] | promoter script len u8 | promoter script
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LaunchTerms<'a> {
    pub h0: u32,
    pub metadata_hash: &'a [u8; 32],
    /// The Bitcoin `scriptPubKey` every ticket must pay.
    pub promoter_script: &'a [u8],
}

pub const TERMS_VERSION: u8 = 1;
/// Long enough for every standard output type (P2TR and P2WSH are 34 bytes).
pub const MAX_PROMOTER_SCRIPT: usize = 34;

impl<'a> LaunchTerms<'a> {
    pub fn parse(args: &'a [u8]) -> Result<Self, TermsError> {
        let (&version, rest) = args.split_first().ok_or(TermsError::Truncated)?;
        if version != TERMS_VERSION {
            return Err(TermsError::UnknownVersion);
        }
        if rest.len() < 4 + 32 + 1 {
            return Err(TermsError::Truncated);
        }
        let h0 = u32::from_le_bytes(rest[..4].try_into().unwrap());
        let metadata_hash: &[u8; 32] = rest[4..36].try_into().unwrap();
        let len = usize::from(rest[36]);
        if len == 0 || len > MAX_PROMOTER_SCRIPT {
            return Err(TermsError::PromoterScript);
        }
        let script = &rest[37..];
        if script.len() < len {
            return Err(TermsError::Truncated);
        }
        if script.len() > len {
            return Err(TermsError::TrailingBytes);
        }
        Ok(LaunchTerms { h0, metadata_hash, promoter_script: script })
    }
}

/// A miner cell's state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MinerState {
    Idle,
    Armed,
}

/// A miner cell's data: its state, the nonce of the last mint, and the height
/// its ticket is anchored at.
///
/// ```text
/// state u8 (0 idle, 1 armed) | nonce u64 LE | anchor u32 LE
/// ```
///
/// The nonce lives in the cell a mint creates rather than in a witness. The
/// RGB++ commitment covers output data, so the nonce is anchored in the Bitcoin
/// transaction itself, and the queue service that completes RGB++ transactions
/// rewrites the witnesses of RGB++ inputs, which would lose it.
///
/// The anchor is why a mint can never be invalidated by when it confirms. Once
/// a Bitcoin transaction spends sealed UTXOs, the CKB transaction it commits to
/// is the only way those cells ever move again; if it could fail, the cells —
/// including any balance the mint carries — would be stranded for good. So the
/// reward is priced at the ticket's anchor, a value fixed before the mint is
/// signed, and the only height-dependent check happens when a ticket is bought,
/// where the most a delay can cost is the empty miner cell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MinerCell {
    pub state: MinerState,
    pub nonce: u64,
    pub anchor: u32,
}

pub const MINER_CELL_BYTES: usize = 13;

impl MinerCell {
    pub fn parse(data: &[u8]) -> Option<Self> {
        let data: &[u8; MINER_CELL_BYTES] = data.try_into().ok()?;
        let state = match data[0] {
            0 => MinerState::Idle,
            1 => MinerState::Armed,
            _ => return None,
        };
        Some(MinerCell {
            state,
            nonce: u64::from_le_bytes(data[1..9].try_into().unwrap()),
            anchor: u32::from_le_bytes(data[9..].try_into().unwrap()),
        })
    }

    pub fn encode(self) -> [u8; MINER_CELL_BYTES] {
        let mut out = [0u8; MINER_CELL_BYTES];
        out[0] = match self.state {
            MinerState::Idle => 0,
            MinerState::Armed => 1,
        };
        out[1..9].copy_from_slice(&self.nonce.to_le_bytes());
        out[9..].copy_from_slice(&self.anchor.to_le_bytes());
        out
    }
}

/// Whether a ticket confirmed at `confirmed` may declare `anchor`: not before
/// the launch opens, not after it confirmed, and at most a day behind.
///
/// The client declares the tip it sees when it signs; the grace absorbs the
/// blocks until confirmation. It also bounds the one advantage a declared
/// anchor offers — claiming the rate of a block that has passed — to a day.
pub fn anchor_valid(anchor: u32, h0: u32, confirmed: u32) -> bool {
    anchor >= h0 && anchor <= confirmed && confirmed - anchor <= ANCHOR_GRACE_BLOCKS
}

/// True when the outputs pay every ticket they arm: the promoter's share for
/// each of `own` cells armed for this promoter, and the platform's share for
/// each of `all` cells armed in the transaction.
///
/// Counted in total rather than per output: one transaction may arm miner
/// cells of several launches, and each needs its own ticket — a single payment
/// must not be counted twice. A promoter who is the platform owes both shares
/// to the one script.
pub fn pays_tickets<'o>(
    outputs: impl IntoIterator<Item = (i64, &'o [u8])> + Clone,
    promoter: &[u8],
    platform: &[u8],
    own: u64,
    all: u64,
) -> bool {
    let owed = |script: &[u8]| {
        let mut due = 0i128;
        if script == promoter {
            due += i128::from(own) * i128::from(PROMOTER_SATS);
        }
        if script == platform {
            due += i128::from(all) * i128::from(PLATFORM_FEE_SATS);
        }
        due
    };
    let paid = |script: &[u8]| -> i128 {
        outputs
            .clone()
            .into_iter()
            .filter(|(_, s)| *s == script)
            .map(|(value, _)| i128::from(value.max(0)))
            .sum()
    };
    paid(promoter) >= owed(promoter) && paid(platform) >= owed(platform)
}

/// The amount in an xUDT cell's data: the first 16 bytes, little-endian.
pub fn udt_amount(data: &[u8]) -> Option<u128> {
    data.get(..16).map(|b| u128::from_le_bytes(b.try_into().unwrap()))
}

#[cfg(test)]
mod tests;
