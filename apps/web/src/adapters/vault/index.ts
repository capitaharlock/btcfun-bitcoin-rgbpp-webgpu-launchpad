/* Public surface of `adapters/vault`. Everything another module may use is named here;
 * the files behind it are internal. */

export { discover, enroll, isSupported, prfSupport, unlock } from "./passkey";
export type { PasskeyRecord, PrfResult, PrfSupport } from "./passkey";
export { connectDemo, connectPasskey, createLocal, current, demoEntropy, exportLocalSecret, forget, importLocal, isPasskeySupported, passkeyPrfSupport } from "./vault";
export type { Vault, VaultKind } from "./vault";
