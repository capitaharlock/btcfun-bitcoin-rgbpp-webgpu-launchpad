/* Byte and hash helpers the simulators share.
 *
 * Node's Buffer, not the app's encoders: the simulators check what the app
 * builds, so they read bytes with a different implementation than the one
 * under test.
 */

import { createHash } from "node:crypto";

export const hex = {
  decode: (s: string) => Uint8Array.from(Buffer.from(s, "hex")),
  encode: (b: Uint8Array) => Buffer.from(b).toString("hex"),
};

/** Reverse a hex string's byte order: Bitcoin shows txids reversed from how they are hashed. */
export const reverse = (h: string) => h.match(/../g)!.reverse().join("");

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest();
