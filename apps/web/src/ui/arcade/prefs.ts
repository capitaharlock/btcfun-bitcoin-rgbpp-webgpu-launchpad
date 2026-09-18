/* What the arcade remembers on this device: the hi-score and whether sound is on.
 *
 * Storage can be missing or refuse (a private window, blocked site data); the
 * game then simply forgets between visits, and never fails over it.
 */

const HI_KEY = "btcfun:arcade:hi";
const SOUND_KEY = "btcfun:arcade:sound";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered: the next visit starts from zero, as a fresh cabinet would.
  }
}

export function readHiScore(): number {
  const n = Number(read(HI_KEY));
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export function writeHiScore(score: number): void {
  if (score > readHiScore()) write(HI_KEY, String(Math.floor(score)));
}

export function readSoundOn(): boolean {
  return read(SOUND_KEY) === "on";
}

export function writeSoundOn(on: boolean): void {
  write(SOUND_KEY, on ? "on" : "off");
}
