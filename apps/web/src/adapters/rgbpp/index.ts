/* Public surface of `adapters/rgbpp`. Everything another module may use is named here;
 * the files behind it are internal. */

export { RgbppService, ServiceError, virtualResult } from "./service";
export type { QueueState, QueueStatus, ServiceCell, ServiceOptions } from "./service";
