/* Public surface of `domain/bitcoin`. Everything another module may use is named here;
 * the files behind it are internal. */

export { addressOfIdentity, deriveAddress, deriveKey, identityOf, signDigest, verifyDigest } from "./keys";
export type { WalletKey } from "./keys";
export { ACTIVE, DUST_SATS, FALLBACK_FEE_RATE, MAINNET, TESTNET3, addressUrl, matchesNetwork, txUrl } from "./network";
export type { NetworkConfig, NetworkId } from "./network";
export { FeeTooLow, InsufficientFunds, MAX_MEMO_BYTES, P2WPKH_SCRIPT_BYTES, buildPayment, estimateVsize, opReturnScriptBytes, selectCoins } from "./payment";
export type { PaymentRequest, Selection, SelectionRequest, SignedPayment } from "./payment";
export { TXID_PATTERN, displayTxid, txidFromInternal, txidToInternal } from "./txid";
export type { AddressBalance, ChainInput, ChainOutput, ChainTx, TxStatus, Utxo } from "./types";
