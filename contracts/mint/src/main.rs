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

#![no_std]
#![cfg_attr(not(test), no_main)]

use ckb_bitcoin_spv_verifier::types::{packed::TransactionProofReader, prelude::Unpack as _};
use ckb_std::{
    ckb_constants::Source,
    ckb_types::{bytes::Bytes, packed::Script, prelude::*},
    error::SysError,
    high_level::{
        load_cell_data, load_cell_lock, load_cell_type, load_script, load_script_hash,
        load_witness_args, QueryIter,
    },
};
use mint_core::{
    anchor_valid, pays_tickets, PLATFORM_SCRIPT, reward, ticket_challenge, udt_amount, work_clz, LaunchTerms, MinerCell,
    MinerState,
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
        // Open. Owner mode is not active without a miner cell input, so the
        // xUDT itself already forbids a mint here.
        (None, Some(MinerState::Idle)) => Ok(()),
        (None, Some(MinerState::Armed)) => Err(Error::ArmedWithoutTicket),
        (None, None) => Err(Error::BadMinerState),
        // Close or move, armed or not: owner mode is active, so this script is
        // what stops a balance from growing.
        (Some(_), None) | (Some(MinerState::Idle), Some(MinerState::Idle)) => no_increase(minted),
        // Ticket: the Bitcoin transaction that moves the cell pays the promoter,
        // and the armed cell records the height its reward will be priced at.
        (Some(MinerState::Idle), Some(MinerState::Armed)) => {
            let btc = verified_bitcoin_tx()?;
            arm(&btc, &terms, after_cell.unwrap())?;
            no_increase(minted)
        }
        // Mint at the consumed ticket's anchor. Nothing here depends on the
        // height this transaction confirms at, so once signed it cannot become
        // invalid — which matters because it may carry the miner's balance.
        // Buying the next ticket in the same transaction would bring the
        // anchor check back into it, so the next ticket is its own transaction.
        (Some(MinerState::Armed), Some(MinerState::Armed)) => Err(Error::MintMustDisarm),
        (Some(MinerState::Armed), Some(MinerState::Idle)) => {
            let (ticket, created) = (before_cell.unwrap(), after_cell.unwrap());
            let expected = mint_amount(&terms, sealed_outpoint()?, created.nonce, ticket.anchor)?;
            if minted == i128::from(expected) {
                Ok(())
            } else {
                Err(Error::WrongAmount)
            }
        }
    }
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

/// A ticket bought by `btc`: paid, and anchored no later than it confirmed and
/// at most a day before.
fn arm(btc: &VerifiedBitcoin, terms: &LaunchTerms, armed: MinerCell) -> Result<(), Error> {
    require_ticket(&btc.tx, terms)?;
    if anchor_valid(armed.anchor, terms.h0, btc.height) {
        Ok(())
    } else {
        Err(Error::BadAnchor)
    }
}

/// The Bitcoin transaction pays one ticket for every miner cell it arms: the
/// promoter's share across every launch of this script that names the same
/// promoter, and the platform's share across every launch.
fn require_ticket(tx: &BTCTx, terms: &LaunchTerms) -> Result<(), Error> {
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
    if pays_tickets(outputs, terms.promoter_script, PLATFORM_SCRIPT, own_armed, all_armed) {
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
