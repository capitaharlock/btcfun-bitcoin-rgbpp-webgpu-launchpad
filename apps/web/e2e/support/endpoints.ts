/* The external services the simulators stand in for, by the URL the app calls.
 *
 * Restated rather than imported from the app's config, which reads
 * `import.meta.env` and so only loads under Vite. They are the defaults the
 * app uses when no override is set; a simulator routes exactly these, so a
 * request it does not answer can never reach the real network.
 */

/** mempool.space's REST API on testnet3. */
export const MEMPOOL_API = "https://mempool.space/testnet/api";
/** The public RGB++ service (the queue, the paymaster, the asset index). */
export const RGBPP_SERVICE = "https://api.testnet.rgbpp.io";
/** A public CKB testnet node's JSON-RPC. */
export const CKB_RPC = "https://testnet.ckb.dev/";
