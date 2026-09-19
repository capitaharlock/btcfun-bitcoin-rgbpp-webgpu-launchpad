/* Public surface of the mining module.
 *
 * Views import from here and never from a backend directly, so the CPU/GPU
 * split stays an implementation detail of `MiningSession`.
 */

export {
  MiningSession,
  type BackendChoice,
  type BackendPorts,
  type SessionCallbacks,
} from "./session";
export {
  absorb,
  browserProgressStore,
  NO_PROGRESS,
  ticketKey,
  type ProgressStore,
  type TicketProgress,
} from "./progress";
export { NONCE_LIMIT, preimage, recompute, verifyCandidate } from "./verify";
export { advantageRatio, expectedClz, weightOf } from "./weight";
export {
  EMPTY_SAMPLE,
  PREIMAGE_BYTES,
  type BackendAvailability,
  type BackendKind,
  type Candidate,
  type MiningSample,
} from "./types";
