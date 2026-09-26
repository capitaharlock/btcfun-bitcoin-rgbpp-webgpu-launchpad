/* Public surface of `ports`: the interfaces the app depends on and the adapters
 * implement. A port names what the app needs, never the technology behind it;
 * `app/services.ts` is where the two meet. */

export { RegistrationNotSeen } from "./certifier";
export type { Certifier } from "./certifier";
export type { ChainProvider } from "./chain";
export type { CkbCells } from "./ckb";
export type { Feed, FeedQuery, Ledger } from "./ledger";
export type { BackendAvailability, BackendProgress, MiningBackend, MiningBackends } from "./mining";
export type { QueueState, QueueStatus, RgbppCell, RgbppGateway } from "./rgbpp";
export type { DeviceStore } from "./storage";
export type { Vault, VaultKind } from "./vault";
