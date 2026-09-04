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
  getTxStatus,
  getUtxos,
  type AddressBalance,
  type TxStatus,
  type Utxo,
} from "./provider";

export {
  InsufficientFunds,
  buildPayment,
  estimateVsize,
  selectCoins,
  type PaymentRequest,
  type Selection,
  type SignedPayment,
} from "./payment";
