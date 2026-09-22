//! The btc.fun mint type script — `PROTOCOL.md` §4.2 and §6.3.
//!
//! It types the miner cell, and the launch's xUDT names this script's hash as
//! its owner with the input-type flag. So xUDT owner mode — the only way to
//! mint — exists in exactly the transactions that consume a miner cell, and
//! every such transaction runs this script, which allows a balance increase
//! only for a paid ticket and a valid proof of work, and only by the standard
//! reward.
//!
//! It does not verify Bitcoin. The miner cell is locked by the RGB++ lock,
//! which already proves, through the Bitcoin SPV client, that the Bitcoin
//! transaction in its witness exists and commits to this CKB transaction. This
//! script reads that same witness — the ticket payment and the confirming
//! height — and checks that the lock really is the RGB++ lock, so the witness
//! it reads is one the lock has verified.
//!
//! A round starts one of two ways. A miner with an idle cell re-arms it with a
//! ticket paid in the arming transaction. A miner without one pays the whole
//! ticket in the transaction that creates the cell, as `Paid`; nothing on CKB
//! can check that transaction, since it spends no RGB++ input, so the payment
//! is checked when the cell is armed: the arming transaction spends the paid
//! cell's seal, and carries the creating transaction in full in its btc.fun
//! witness, which is authentic when it hashes to the seal's txid.
//!
//! The btc.fun witness is the first witness past the inputs. The RGB++ queue
//! rewrites the witnesses of RGB++ inputs, and only those; one past the inputs
//! reaches the script as the client wrote it. Nothing it carries needs to be
//! trusted: a creating transaction is checked against its hash, a nonce
//! against the work it claims.

#![no_std]
#![cfg_attr(not(test), no_main)]

use ckb_bitcoin_spv_verifier::types::{packed::TransactionProofReader, prelude::Unpack as _};
use ckb_std::{
    ckb_constants::Source,
    ckb_types::{bytes::Bytes, packed::Script, prelude::*},
    error::SysError,
    high_level::{
        load_cell_data, load_cell_lock, load_cell_type, load_input_since, load_script, load_script_hash, load_witness,
        load_witness_args, QueryIter,
    },
};
use mint_core::{
    admitted, ADMISSION_BYTES, PLATFORM_CERT_KEY, anchor_valid, pays_tickets, reward, ticket_challenge, txid, udt_amount, work_clz, LaunchTerms, MinerCell,
    MinerState, Split, NEW_CELL, PAID_SEAL_VOUT, PLATFORM_SCRIPT, REUSE,
};
use rgbpp_core::{
    bitcoin::{parse_btc_tx, BTCTx},
    schemas::rgbpp::{RGBPPLock, RGBPPUnlock},
};

mod config;
use config::*;

ckb_std::entry!(program_entry);
ckb_std::default_alloc!(4 * 1024, 1024 * 1024, 64);

#[repr(i8)]
#[derive(Debug, Clone, Copy)]
enum Error {
    Syscall = 1,
    BadTerms,
    BadMinerState,
    TooManyMinerCells,
    NotRgbppLock,
    BadRgbppWitness,
    BadBitcoinTx,
    BadSpvProof,
    TicketUnpaid,
    WorkTooWeak,
    WrongAmount,
    BalanceIncreased,
    ArmedWithoutTicket,
    BadAnchor,
    MintMustDisarm,
    UdtOverflow,
    BadUdtData,
    /// A paid cell created where an RGB++ input could lend its payment.
    PaidBesideRgbppInput,
    /// A paid cell may only be armed or closed.
    PaidCannotMove,
    /// No btc.fun witness, or one that is not what this step needs.
    BadBtcfunWitness,
    /// The paid cell is not sealed where a ticket seals it, or the creating
    /// transaction in the witness is not the one the seal names.
    BadPaidSeal,
    /// Arming a paid cell beside anything but paid cells.
    PaidArmedBesideOthers,
    /// An armed cell names a ticket other than the paid cell's seal, or an
    /// idle cell's arming names one at all.
    BadTicketName,
    /// The arming of a paid cell carries no valid btc.fun certificate for
    /// these terms: the launch was never registered.
    NotCertified,
    /// A miner cell created idle. An idle cell exists only as a mint leaves
    /// it, so every way into a mint passes through a certified arming.
    OpenedIdle,
}

impl From<SysError> for Error {
    fn from(_: SysError) -> Self {
        Error::Syscall
    }
}

pub fn program_entry() -> i8 {
    match main() {
        Ok(()) => 0,
        Err(err) => err as i8,
    }
}

fn main() -> Result<(), Error> {
    let script = load_script()?;
    let args: Bytes = script.args().unpack();
    let terms = LaunchTerms::parse(&args).map_err(|_| Error::BadTerms)?;

    let before_cell = only_miner_cell(Source::GroupInput)?;
    let after_cell = only_miner_cell(Source::GroupOutput)?;
    let (before, after) = (before_cell.map(|cell| cell.state), after_cell.map(|cell| cell.state));
    // Every miner cell that exists is bound to a Bitcoin UTXO. The RGB++ lock
    // checks this for its own outputs, but an opening transaction has no RGB++
    // input, so nothing else would.
    if after.is_some() && !is_rgbpp_lock(&load_cell_lock(0, Source::GroupOutput)?) {
        return Err(Error::NotRgbppLock);
    }

    let minted = udt_delta(&load_script_hash()?)?;

    match (before, after) {
        // Nobody opens an idle cell: an idle cell is what a mint leaves, and
        // the only other way to one would skip the certified arming.
        (None, Some(MinerState::Idle)) => Err(Error::OpenedIdle),
        // Open paid: the ticket transaction creates the cell. Its payment is
        // checked when the cell is armed. An RGB++ input here would mean the
        // same Bitcoin transaction also moves other cells — perhaps arming one,
        // with a payment this cell could later claim as its own.
        (None, Some(MinerState::Paid)) => {
            if QueryIter::new(load_cell_lock, Source::Input).any(|lock| is_rgbpp_lock(&lock)) {
                Err(Error::PaidBesideRgbppInput)
            } else {
                Ok(())
            }
        }
        (None, Some(MinerState::Armed)) => Err(Error::ArmedWithoutTicket),
        (None, None) => Err(Error::BadMinerState),
        // Ticket on an idle cell: the arming Bitcoin transaction pays it.
        (Some(MinerState::Idle), Some(MinerState::Armed)) => {
            let btc = verified_bitcoin_tx()?;
            let armed = after_cell.unwrap();
            if armed.ticket.is_some() {
                return Err(Error::BadTicketName);
            }
            arm(&btc, &terms, armed)?;
            require_ticket(&btc.tx, &terms, REUSE)?;
            no_increase(minted)
        }
        // Ticket on a paid cell: the creating transaction paid it.
        (Some(MinerState::Paid), Some(MinerState::Armed)) => {
            // Only a launch btc.fun registered takes its first ticket from a
            // miner; every later one re-arms a cell this arming made possible.
            if !admitted(&args, &admission()?, &PLATFORM_CERT_KEY) {
                return Err(Error::NotCertified);
            }
            let btc = verified_bitcoin_tx()?;
            let armed = after_cell.unwrap();
            // The ticket's output is the challenge from here on: mining began
            // on it when it was broadcast (`MinerCell`).
            if armed.ticket != Some(sealed_outpoint()?.0) {
                return Err(Error::BadTicketName);
            }
            arm(&btc, &terms, armed)?;
            if QueryIter::new(load_cell_data, Source::Input).any(|data| {
                MinerCell::parse(&data).is_some_and(|cell| cell.state != MinerState::Paid)
            }) {
                return Err(Error::PaidArmedBesideOthers);
            }
            let creating = creating_tx()?;
            require_ticket(&creating, &terms, NEW_CELL)?;
            no_increase(minted)
        }
        (Some(MinerState::Paid), Some(_)) => Err(Error::PaidCannotMove),
        (Some(_), Some(MinerState::Paid)) => Err(Error::BadMinerState),
        // Mint at the consumed ticket's anchor. Nothing here depends on the
        // height this transaction confirms at, so once signed it cannot become
        // invalid — which matters because it may carry the miner's balance.
        // Buying the next ticket in the same transaction would bring the
        // anchor check back into it, so the next ticket is its own transaction.
        (Some(MinerState::Armed), Some(MinerState::Armed)) => Err(Error::MintMustDisarm),
        (Some(MinerState::Armed), Some(MinerState::Idle)) => {
            let (ticket, created) = (before_cell.unwrap(), after_cell.unwrap());
            let expected = mint_amount(&terms, challenge_of(&ticket)?, created.nonce, ticket.anchor)?;
            exactly(minted, expected)
        }
        // A first mint dissolves the miner cell into the token cell, whose
        // capacity it becomes. No cell is left to carry the nonce, so it
        // travels in the btc.fun witness; a wrong one fails the work check, and
        // one that moves nothing is a plain close.
        (Some(MinerState::Armed), None) if minted != 0 => {
            let ticket = before_cell.unwrap();
            let expected = mint_amount(&terms, challenge_of(&ticket)?, witness_nonce()?, ticket.anchor)?;
            exactly(minted, expected)
        }
        // Close or move: owner mode is active, so this script is what stops a
        // balance from growing.
        (Some(_), None) | (Some(MinerState::Idle), Some(MinerState::Idle)) => no_increase(minted),
    }
}

fn exactly(minted: i128, expected: u64) -> Result<(), Error> {
    if minted == i128::from(expected) {
        Ok(())
    } else {
        Err(Error::WrongAmount)
    }
}

/// The outpoint an armed cell is mined against: the ticket it names, or else
/// the output it is sealed to.
fn challenge_of(armed: &MinerCell) -> Result<([u8; 32], u32), Error> {
    match armed.ticket {
        Some(txid) => Ok((txid, PAID_SEAL_VOUT)),
        None => sealed_outpoint(),
    }
}

/// The btc.fun witness: the first witness past the inputs.
fn btcfun_witness() -> Result<Bytes, Error> {
    let inputs = QueryIter::new(load_input_since, Source::Input).count();
    load_witness(inputs, Source::Input).map(Bytes::from).map_err(|_| Error::BadBtcfunWitness)
}

/// The admission a paid cell's arming carries: the first `ADMISSION_BYTES`
/// of the btc.fun witness, before the creating transaction.
fn admission() -> Result<Bytes, Error> {
    let witness = btcfun_witness()?;
    if witness.len() < ADMISSION_BYTES {
        return Err(Error::BadBtcfunWitness);
    }
    Ok(witness.slice(..ADMISSION_BYTES))
}

/// The nonce a dissolving mint claims: eight bytes, little-endian.
fn witness_nonce() -> Result<u64, Error> {
    let witness = btcfun_witness()?;
    let bytes: [u8; 8] = witness.as_ref().try_into().map_err(|_| Error::BadBtcfunWitness)?;
    Ok(u64::from_le_bytes(bytes))
}

/// The Bitcoin transaction that created the paid cell being armed: carried
/// whole in the btc.fun witness, and authentic because it hashes to the txid
/// the cell is sealed to — the output the arming transaction spends, which the
/// RGB++ lock has verified.
fn creating_tx() -> Result<BTCTx, Error> {
    let (seal_txid, vout) = sealed_outpoint()?;
    if vout != PAID_SEAL_VOUT {
        return Err(Error::BadPaidSeal);
    }
    let witness = btcfun_witness()?;
    if witness.len() < ADMISSION_BYTES {
        return Err(Error::BadBtcfunWitness);
    }
    let raw = witness.slice(ADMISSION_BYTES..);
    if txid(&raw) != seal_txid {
        return Err(Error::BadPaidSeal);
    }
    parse_btc_tx(&raw).map_err(|_| Error::BadBitcoinTx)
}

/// The single miner cell in `source`, if any. More than one per side would let
/// one ticket payment arm several cells.
fn only_miner_cell(source: Source) -> Result<Option<MinerCell>, Error> {
    let mut cells = QueryIter::new(load_cell_data, source);
    let first = match cells.next() {
        None => return Ok(None),
        Some(data) => MinerCell::parse(&data).ok_or(Error::BadMinerState)?,
    };
    if cells.next().is_some() {
        return Err(Error::TooManyMinerCells);
    }
    Ok(Some(first))
}

fn no_increase(minted: i128) -> Result<(), Error> {
    if minted > 0 {
        Err(Error::BalanceIncreased)
    } else {
        Ok(())
    }
}

/// Outputs minus inputs of this launch's xUDT: exactly the standard xUDT code
/// with this script's hash as owner under the input-type flag. Matching the
/// code hash matters — a look-alike type with the same args could otherwise
/// offset the count.
fn udt_delta(owner: &[u8; 32]) -> Result<i128, Error> {
    let mut expected_args = [0u8; 36];
    expected_args[..32].copy_from_slice(owner);
    expected_args[32..].copy_from_slice(&XUDT_OWNER_BY_INPUT_TYPE.to_le_bytes());

    let total = |source: Source| -> Result<u128, Error> {
        let mut sum: u128 = 0;
        for (index, type_script) in QueryIter::new(load_cell_type, source).enumerate() {
            let Some(type_script) = type_script else { continue };
            if !is_launch_udt(&type_script, &expected_args) {
                continue;
            }
            let data = load_cell_data(index, source)?;
            let amount = udt_amount(&data).ok_or(Error::BadUdtData)?;
            sum = sum.checked_add(amount).ok_or(Error::UdtOverflow)?;
        }
        Ok(sum)
    };

    let (inputs, outputs) = (total(Source::Input)?, total(Source::Output)?);
    // Both sides are bounded by the xUDT's own u128 accounting; the difference
    // of two such values fits i128 unless one exceeds i128::MAX, which is
    // treated as overflow rather than wrapped.
    let inputs = i128::try_from(inputs).map_err(|_| Error::UdtOverflow)?;
    let outputs = i128::try_from(outputs).map_err(|_| Error::UdtOverflow)?;
    Ok(outputs - inputs)
}

fn is_launch_udt(script: &Script, expected_args: &[u8; 36]) -> bool {
    script.code_hash().as_slice() == XUDT_CODE_HASH
        && u8::from(script.hash_type()) == XUDT_HASH_TYPE
        && script.args().raw_data().as_ref() == expected_args
}

fn is_rgbpp_lock(lock: &Script) -> bool {
    lock.code_hash().as_slice() == RGBPP_LOCK_CODE_HASH && u8::from(lock.hash_type()) == RGBPP_LOCK_HASH_TYPE
}

struct VerifiedBitcoin {
    tx: BTCTx,
    /// The height at which the SPV proof places the transaction.
    height: u32,
}

/// The input miner cell's RGB++ lock, refused unless it is the RGB++ lock:
/// under any other lock nothing ties the cell to Bitcoin, and a witness could
/// say whatever it liked.
fn input_rgbpp_lock() -> Result<Script, Error> {
    let lock = load_cell_lock(0, Source::GroupInput)?;
    if is_rgbpp_lock(&lock) {
        Ok(lock)
    } else {
        Err(Error::NotRgbppLock)
    }
}

/// The Bitcoin outpoint the input miner cell is sealed to: its ticket, and the
/// mining challenge. The RGB++ lock only lets the cell move in a transaction
/// that spends this outpoint.
fn sealed_outpoint() -> Result<([u8; 32], u32), Error> {
    let lock = input_rgbpp_lock()?;
    let seal = RGBPPLock::from_slice(&lock.args().raw_data()).map_err(|_| Error::BadRgbppWitness)?;
    let txid: [u8; 32] = seal.btc_txid().as_slice().try_into().map_err(|_| Error::BadRgbppWitness)?;
    Ok((txid, seal.out_index().unpack()))
}

/// The Bitcoin transaction behind the input miner cell, read from the witness
/// its RGB++ lock verifies.
fn verified_bitcoin_tx() -> Result<VerifiedBitcoin, Error> {
    let lock = input_rgbpp_lock()?;
    let unlock = rgbpp_unlock(&lock)?;
    let tx = parse_btc_tx(&unlock.btc_tx().raw_data()).map_err(|_| Error::BadBitcoinTx)?;
    let proof_bytes = unlock.btc_tx_proof().raw_data();
    let proof = TransactionProofReader::from_slice(&proof_bytes).map_err(|_| Error::BadSpvProof)?;
    let height: u32 = proof.height().unpack();
    Ok(VerifiedBitcoin { tx, height })
}

/// The RGB++ unlock the lock actually verified for the miner cell.
///
/// The RGB++ lock runs once per lock group — every input with the identical
/// lock, which cells sealed to the same UTXO share — and verifies only the
/// witness of that group's first input. The miner cell need not be first: a
/// token cell sealed to the same UTXO may precede it. Reading the miner cell's
/// own witness would then read one nobody verified, and a forged one could
/// claim a ticket payment or a height. So this finds the group's first input
/// and follows the lock's own convention from there: a four-byte witness is
/// the index of the input whose witness holds the unlock.
fn rgbpp_unlock(lock: &Script) -> Result<RGBPPUnlock, Error> {
    let first = QueryIter::new(load_cell_lock, Source::Input)
        .position(|candidate| candidate.as_slice() == lock.as_slice())
        .ok_or(Error::BadRgbppWitness)?;
    let field = load_witness_args(first, Source::Input)?
        .lock()
        .to_opt()
        .ok_or(Error::BadRgbppWitness)?
        .raw_data();
    let field = if field.len() == 4 {
        let index = u32::from_le_bytes(field[..].try_into().unwrap()) as usize;
        load_witness_args(index, Source::Input)?
            .lock()
            .to_opt()
            .ok_or(Error::BadRgbppWitness)?
            .raw_data()
    } else {
        field
    };
    RGBPPUnlock::from_slice(&field).map_err(|_| Error::BadRgbppWitness)
}

/// A ticket armed by `btc`: anchored no later than it confirmed and at most a
/// day before. Who paid for it is the caller's check.
fn arm(btc: &VerifiedBitcoin, terms: &LaunchTerms, armed: MinerCell) -> Result<(), Error> {
    if anchor_valid(armed.anchor, terms.h0, btc.height) {
        Ok(())
    } else {
        Err(Error::BadAnchor)
    }
}

/// `tx` pays one ticket at `price` for every miner cell this transaction arms:
/// the promoter's share across every launch of this script that names the same
/// promoter, and the platform's share across every launch.
fn require_ticket(tx: &BTCTx, terms: &LaunchTerms, price: Split) -> Result<(), Error> {
    let own = load_script()?;
    let (mut own_armed, mut all_armed) = (0u64, 0u64);
    for (index, type_script) in QueryIter::new(load_cell_type, Source::Output).enumerate() {
        let Some(type_script) = type_script else { continue };
        if type_script.code_hash().as_slice() != own.code_hash().as_slice()
            || type_script.hash_type() != own.hash_type()
        {
            continue;
        }
        let args: Bytes = type_script.args().unpack();
        let Ok(other) = LaunchTerms::parse(&args) else { continue };
        let data = load_cell_data(index, Source::Output)?;
        if MinerCell::parse(&data).is_some_and(|cell| cell.state == MinerState::Armed) {
            all_armed += 1;
            if other.promoter_script == terms.promoter_script {
                own_armed += 1;
            }
        }
    }
    let outputs = tx.outputs.iter().map(|out| (out.value, out.script.as_ref()));
    if pays_tickets(outputs, terms.promoter_script, PLATFORM_SCRIPT, own_armed, all_armed, price) {
        Ok(())
    } else {
        Err(Error::TicketUnpaid)
    }
}

/// What this mint may add: the standard reward for `nonce`, carried by the
/// miner cell the mint creates, against the ticket the consumed cell was
/// sealed to, priced at that ticket's anchor. It reads no witness and no
/// height, so it is decided entirely by what the transaction's author signed.
fn mint_amount(terms: &LaunchTerms, ticket: ([u8; 32], u32), nonce: u64, anchor: u32) -> Result<u64, Error> {
    let (txid, vout) = ticket;
    let clz = work_clz(&ticket_challenge(&txid, vout), nonce);
    reward(clz, terms.h0, anchor).ok_or(Error::WorkTooWeak)
}
