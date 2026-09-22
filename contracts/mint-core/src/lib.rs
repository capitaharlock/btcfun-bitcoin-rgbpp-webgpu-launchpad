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
/// Price of one ticket, in satoshis, whatever the round: one number a miner
/// can know before buying. Network fees are not part of it.
pub const TICKET_SATS: u64 = 14_983;
/// What a ticket sets aside for the RGB++ paymaster when the round needs a new
/// miner cell: the paymaster's fee on CKB testnet when this was set. A higher
/// fee is paid on top of the ticket, never out of the split.
pub const PAYMASTER_BUDGET_SATS: u64 = 7_000;
/// The platform's percentage of what the ticket leaves after the paymaster,
/// rounded down; the promoter receives the rest.
pub const PLATFORM_PERCENT: u64 = 11;

/// Where a ticket's satoshis go.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Split {
    pub paymaster: u64,
    pub platform: u64,
    pub promoter: u64,
}

/// The split of one ticket: with `new_cell`, the round creates its miner cell
/// and the paymaster's budget comes off the top.
pub const fn split(new_cell: bool) -> Split {
    let paymaster = if new_cell { PAYMASTER_BUDGET_SATS } else { 0 };
    let shared = TICKET_SATS - paymaster;
    let platform = shared * PLATFORM_PERCENT / 100;
    Split { paymaster, platform, promoter: shared - platform }
}

/// A round that creates its miner cell: 7,000 + 878 + 7,105.
pub const NEW_CELL: Split = split(true);
/// A round that re-arms an idle miner cell: 1,648 + 13,335.
pub const REUSE: Split = split(false);
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

/// btc.fun's certificate key (BIP340 x-only). It signs a launch's terms once
/// its registration fee is paid; the matching secret never leaves the
/// platform's signer.
#[cfg(not(feature = "test-cert-key"))]
pub const PLATFORM_CERT_KEY: [u8; 32] = [0x9f, 0x21, 0x69, 0x7a, 0xa0, 0xe6, 0x1b, 0xc6, 0x5c, 0x23, 0xeb, 0x84, 0xa5, 0x25, 0xbb, 0x1a, 0x42, 0x82, 0x21, 0x1d, 0x26, 0x5d, 0x3d, 0x08, 0x0e, 0x49, 0x37, 0x1e, 0xf8, 0x09, 0xbd, 0xfa];

/// The contract tests' build trusts a published key instead
/// (`TEST_CERT_SECRET`): the deployed binary is built without this feature.
#[cfg(feature = "test-cert-key")]
pub const PLATFORM_CERT_KEY: [u8; 32] = TEST_CERT_KEY;

/// A key anyone may sign with, for tests and vectors only: `0x42` × 32.
pub const TEST_CERT_SECRET: [u8; 32] = [0x42; 32];
pub const TEST_CERT_KEY: [u8; 32] = [0x24, 0x65, 0x3e, 0xac, 0x43, 0x44, 0x88, 0x00, 0x2c, 0xc0, 0x6b, 0xbf, 0xb7, 0xf1, 0x0f, 0xe1, 0x89, 0x91, 0xe3, 0x5f, 0x9f, 0xe4, 0x30, 0x2d, 0xbe, 0xa6, 0xd2, 0x35, 0x3d, 0xc0, 0xab, 0x1c];

/// Domain tag of what a certificate signs, so a platform signature over
/// anything else can never pass as one.
pub const CERTIFICATE_DOMAIN: &[u8] = b"btc.fun/launch-certificate/v1";

/// A launch's admission: the registration it paid (txid, internal order) and
/// btc.fun's certificate over its terms and that registration. It travels in
/// the arming of a paid cell — every miner's first way into a launch — rather
/// than in the terms, where 96 more bytes in every miner cell's type script
/// would outgrow the paymaster's cell.
pub const ADMISSION_BYTES: usize = 32 + 64;

/// What a certificate signs: `sha256(domain ‖ terms args ‖ registration txid)`.
pub fn certificate_message(args: &[u8], registration: &[u8; 32]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(CERTIFICATE_DOMAIN);
    h.update(args);
    h.update(registration);
    h.finalize().into()
}

/// True when `admission` (registration ‖ BIP340 signature) is `key`'s
/// certificate over `args`. The registration must name a transaction: an
/// all-zero txid was how the platform once admitted its own launches without
/// paying, and no certificate over it is honoured, so every mineable launch
/// points at a real registration payment on Bitcoin.
pub fn admitted(args: &[u8], admission: &[u8], key: &[u8; 32]) -> bool {
    use k256::schnorr::{signature::hazmat::PrehashVerifier, Signature, VerifyingKey};
    let Ok(admission) = <&[u8; ADMISSION_BYTES]>::try_from(admission) else {
        return false;
    };
    let registration: &[u8; 32] = admission[..32].try_into().unwrap();
    if registration.iter().all(|&b| b == 0) {
        return false;
    }
    let (Ok(key), Ok(sig)) = (VerifyingKey::from_bytes(key), Signature::try_from(&admission[32..])) else {
        return false;
    };
    key.verify_prehash(&certificate_message(args, registration), &sig).is_ok()
}

/// Sats a launch's registration pays the platform. Checked by the certificate
/// signer, off chain; here so both languages share it.
pub const REGISTRATION_SATS: u64 = 20_000;

/// Domain tag of the commitment a registration's `OP_RETURN` carries.
pub const REGISTRATION_DOMAIN: &[u8] = b"btc.fun/launch-registration/v1";

/// The 32 bytes a registration commits to: `sha256(domain ‖ terms args)`. It
/// ties one payment to one launch; the signer checks it before signing.
pub fn registration_commitment(args: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(REGISTRATION_DOMAIN);
    h.update(args);
    h.finalize().into()
}

/// A miner cell's state.
///
/// `Paid` is a cell created by a ticket payment and not armed yet. Creating a
/// cell spends no RGB++ input, so nothing on CKB verifies the Bitcoin
/// transaction behind it; the payment is checked when the cell is armed,
/// against that transaction, which the arming transaction spends. A paid cell
/// cannot move, so the transaction it names is always the one that created it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MinerState {
    Idle,
    Armed,
    Paid,
}

/// The output of a ticket transaction a paid miner cell is sealed to.
pub const PAID_SEAL_VOUT: u32 = 1;

/// A miner cell's data: its state, the nonce of the last mint, the height its
/// ticket is anchored at, and — only on a cell armed from `Paid` — the txid of
/// the ticket that paid for it.
///
/// ```text
/// state u8 (0 idle, 1 armed, 2 paid) | nonce u64 LE | anchor u32 LE [| ticket txid 32]
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
///
/// The ticket txid is why a miner who creates a cell can mine the moment the
/// ticket is broadcast. The challenge of an armed cell is normally the output
/// it is sealed to; a cell armed from `Paid` is sealed to the arming
/// transaction, which can only be signed once the ticket has settled on CKB.
/// Naming the ticket instead makes its output 1 — which exists as soon as the
/// ticket does, and not before it is paid — the challenge. The script only
/// lets the arming of a paid cell write it, equal to that cell's seal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MinerCell {
    pub state: MinerState,
    pub nonce: u64,
    pub anchor: u32,
    pub ticket: Option<[u8; 32]>,
}

pub const MINER_CELL_BYTES: usize = 13;
/// A cell armed from `Paid`: the ticket's txid follows.
pub const MINER_CELL_TICKET_BYTES: usize = MINER_CELL_BYTES + 32;

/// An encoded miner cell: 13 bytes, or 45 when it names its ticket.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EncodedCell {
    bytes: [u8; MINER_CELL_TICKET_BYTES],
    len: usize,
}

impl core::ops::Deref for EncodedCell {
    type Target = [u8];
    fn deref(&self) -> &[u8] {
        &self.bytes[..self.len]
    }
}

impl MinerCell {
    pub fn parse(data: &[u8]) -> Option<Self> {
        let (head, ticket) = match data.len() {
            MINER_CELL_BYTES => (data, None),
            MINER_CELL_TICKET_BYTES => (&data[..MINER_CELL_BYTES], Some(data[MINER_CELL_BYTES..].try_into().unwrap())),
            _ => return None,
        };
        let state = match head[0] {
            0 => MinerState::Idle,
            1 => MinerState::Armed,
            2 => MinerState::Paid,
            _ => return None,
        };
        // Only an armed cell mines against a ticket other than its seal.
        if ticket.is_some() && state != MinerState::Armed {
            return None;
        }
        Some(MinerCell {
            state,
            nonce: u64::from_le_bytes(head[1..9].try_into().unwrap()),
            anchor: u32::from_le_bytes(head[9..13].try_into().unwrap()),
            ticket,
        })
    }

    pub fn encode(self) -> EncodedCell {
        let mut bytes = [0u8; MINER_CELL_TICKET_BYTES];
        bytes[0] = match self.state {
            MinerState::Idle => 0,
            MinerState::Armed => 1,
            MinerState::Paid => 2,
        };
        bytes[1..9].copy_from_slice(&self.nonce.to_le_bytes());
        bytes[9..13].copy_from_slice(&self.anchor.to_le_bytes());
        let len = match self.ticket {
            None => MINER_CELL_BYTES,
            Some(txid) => {
                bytes[MINER_CELL_BYTES..].copy_from_slice(&txid);
                MINER_CELL_TICKET_BYTES
            }
        };
        EncodedCell { bytes, len }
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

/// True when the outputs pay every ticket they arm at `price`: the promoter's
/// share for each of `own` cells armed for this promoter, and the platform's
/// share for each of `all` cells armed in the transaction.
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
    price: Split,
) -> bool {
    let owed = |script: &[u8]| {
        let mut due = 0i128;
        if script == promoter {
            due += i128::from(own) * i128::from(price.promoter);
        }
        if script == platform {
            due += i128::from(all) * i128::from(price.platform);
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

/// A Bitcoin transaction's id, in internal byte order, from its serialization
/// without witnesses — the form RGB++ carries and seals name.
pub fn txid(raw: &[u8]) -> [u8; 32] {
    Sha256::digest(Sha256::digest(raw)).into()
}

/// The amount in an xUDT cell's data: the first 16 bytes, little-endian.
pub fn udt_amount(data: &[u8]) -> Option<u128> {
    data.get(..16).map(|b| u128::from_le_bytes(b.try_into().unwrap()))
}

#[cfg(test)]
mod tests;
