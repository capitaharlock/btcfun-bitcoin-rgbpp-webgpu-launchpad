/* What the arcade remembers on this device: the hi-score and whether sound is on.
 *
 * Storage can be missing or refuse (a private window, blocked site data); the
 * game then simply forgets between visits, as a fresh cabinet would, and never
 * fails over it (`lib/storage.ts`).
 */

import { readStored, writeStored } from "../../lib/storage";

const HI_KEY = "btcfun:arcade:hi";
const SOUND_KEY = "btcfun:arcade:sound";

export function readHiScore(): number {
  const n = Number(readStored(HI_KEY));
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export function writeHiScore(score: number): void {
  if (score > readHiScore()) writeStored(HI_KEY, String(Math.floor(score)));
}

export function readSoundOn(): boolean {
  return readStored(SOUND_KEY) === "on";
}

export function writeSoundOn(on: boolean): void {
  writeStored(SOUND_KEY, on ? "on" : "off");
}
