/* What the arcade remembers on this device: the hi-score and whether sound is on.
 *
 * Kept through the `DeviceStore` port the scene hands in, so this feature
 * names no storage technology. Storage can be missing or refuse (a private
 * window, blocked site data); the game then simply forgets between visits, as
 * a fresh cabinet would, and never fails over it.
 */

import type { DeviceStore } from "@/ports";

const HI_KEY = "btcfun:arcade:hi";
const SOUND_KEY = "btcfun:arcade:sound";

export function readHiScore(store: DeviceStore): number {
  const n = Number(store.read(HI_KEY));
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export function writeHiScore(store: DeviceStore, score: number): void {
  if (score > readHiScore(store)) store.write(HI_KEY, String(Math.floor(score)));
}

export function readSoundOn(store: DeviceStore): boolean {
  return store.read(SOUND_KEY) === "on";
}

export function writeSoundOn(store: DeviceStore, on: boolean): void {
  store.write(SOUND_KEY, on ? "on" : "off");
}
