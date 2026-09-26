/* Public surface of `adapters/activity-index`. Everything another module may use is named here;
 * the files behind it are internal. */

export { clearLocal, feed, publish, record, remember } from "./client";
export type { Feed, FeedQuery } from "./client";
