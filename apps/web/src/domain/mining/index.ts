/* Public surface of `domain/mining`. Everything another module may use is named here;
 * the files behind it are internal. */

export { costsFor, planFor } from "./costs";
export type { Costs, Funds, PlannedLaunch, SigningStep } from "./costs";
export { STEPS, currentTicket, deriveLoop, inProgress, statusOf, stepOf, traceOf } from "./loop";
export type { Loop, LoopInput, LoopOperation, LoopState, LoopStep, StepStatus, Ticket, Trace, TraceStage, Traces, Unarmed, WalletKind } from "./loop";
export { MIN_FAST_FEE_RATE, fastFrom } from "./fees";
export { NO_PROGRESS, PROGRESS_KEY, absorb, laneFrontier, nonceWords, readProgress, stronger, ticketKey, writeProgress } from "./progress";
export type { ProgressStore, TicketProgress } from "./progress";
export { EMPTY_SAMPLE, PREIMAGE_BYTES } from "./types";
export type { BackendKind, Candidate, MiningSample } from "./types";
export { NONCE_LIMIT, preimage, recompute, verifyCandidate } from "./verify";
export { advantageRatio, expectedClz, weightOf } from "./weight";
