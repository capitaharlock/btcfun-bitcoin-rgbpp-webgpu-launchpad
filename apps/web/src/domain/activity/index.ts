/* Public surface of `domain/activity`. Everything another module may use is named here;
 * the files behind it are internal. */

export { signActivity } from "./events";
export type { ActivityDraft, ActivitySigner } from "./events";
export { ACTIVITY_VERSION, ActivityError, KIND_LABEL } from "./types";
export type { ActivityBody, ActivityEntry, ActivityKind, SignedActivity } from "./types";
export { MAX_META, activityDigest, activityId, faultIn, isValid, payloadRef } from "./verify";
