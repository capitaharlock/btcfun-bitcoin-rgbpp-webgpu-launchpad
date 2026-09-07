/* Public surface of the ledger module. */

export { encodeRecord, headOf, parseAtoms, recordDigest, recordId } from "./codec";
export {
  allocate,
  claimChallenge,
  epochBudget,
  recordIds,
  replay,
  type Allocation,
  type LaunchRules,
} from "./rules";
export { decodeChain, decodeRecord } from "./decode";
export { previewClaim, signClaim, signTransfer, type ClaimDraft, type TransferDraft } from "./author";
export { CorruptLedger, LocalLedger, type StoredChain } from "./store";
export {
  GENESIS_PREV,
  LedgerError,
  MAX_MEMO_CHARS,
  TOKEN_DECIMALS,
  type ClaimRecord,
  type Ledger,
  type LedgerBody,
  type LedgerState,
  type RecordKind,
  type SignedRecord,
  type TransferRecord,
} from "./types";
