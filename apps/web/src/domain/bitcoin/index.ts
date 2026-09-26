/* Public surface of `domain/bitcoin`. Everything another module may use is named here;
 * the files behind it are internal. */

export { FeeTooLow, InsufficientFunds, assertFeeCovers, selectCoins } from "./coins";
export type { ForeignInputs, Selection, SelectionRequest } from "./coins";
export { addressOfIdentity, deriveAddress, deriveKey, identityOf, signDigest } from "./keys";
export type { WalletKey } from "./keys";
export { ACTIVE, DUST_SATS, FALLBACK_FEE_RATE, MAINNET, TESTNET3, addressUrl, matchesNetwork, txUrl } from "./network";
export type { NetworkConfig, NetworkId } from "./network";
export { addressScript, buildPayment } from "./payment";
export type { PaymentRequest, SignedPayment } from "./payment";
export { MAX_MEMO_BYTES, P2WPKH_SCRIPT_BYTES, estimateVsize, opReturnScriptBytes } from "./size";
export { TXID_PATTERN, displayTxid, txidFromInternal, txidToInternal } from "./txid";
export type { AddressBalance, ChainInput, ChainOutput, ChainTx, TxStatus, Utxo } from "./types";
