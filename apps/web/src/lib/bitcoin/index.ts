/* Public surface of the bitcoin module. */

export {
  ACTIVE,
  DUST_SATS,
  addressUrl,
  matchesNetwork,
  txUrl,
  type NetworkConfig,
  type NetworkId,
} from "./network";

export { deriveAddress, deriveKey, identityOf, signDigest, verifyDigest, type WalletKey } from "./keys";

export {
  connectPasskey,
  createLocal,
  current as currentVault,
  exportLocalSecret,
  forget as forgetVault,
  importLocal,
  isPasskeySupported,
  passkeyPrfSupport,
  type Vault,
  type VaultKind,
} from "./vault";

export {
  ProviderError,
  broadcast,
  getBalance,
  getBlockHash,
  getFeeRate,
  getTipHeight,
  getAddressTxs,
  getTx,
  getTxStatus,
  getUtxos,
  type AddressBalance,
  type ChainOutput,
  type ChainTx,
  type TxStatus,
  type Utxo,
} from "./provider";

export {
  FeeTooLow,
  InsufficientFunds,
  MAX_MEMO_BYTES,
  P2WPKH_SCRIPT_BYTES,
  buildPayment,
  estimateVsize,
  opReturnScriptBytes,
  selectCoins,
  type PaymentRequest,
  type Selection,
  type SelectionRequest,
  type SignedPayment,
} from "./payment";
