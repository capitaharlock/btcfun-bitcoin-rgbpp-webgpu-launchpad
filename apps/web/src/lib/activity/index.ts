/* Public surface of the activity module. */

export { signActivity, type ActivityDraft } from "./events";
export { evidenceFor, type Evidence } from "./evidence";
export { activityDigest, activityId, faultIn, isValid, payloadRef } from "./verify";
export { clearLocal, feed, publish, record, remember, type Feed, type FeedQuery } from "./index-client";
export {
  ACTIVITY_VERSION,
  ActivityError,
  KIND_LABEL,
  type ActivityBody,
  type ActivityEntry,
  type ActivityKind,
  type SignedActivity,
} from "./types";
