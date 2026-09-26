/* Pausing and restarting: the phase changes a player asks for, as opposed to
 * the ones the rules bring about.
 */

import { OVER_HOLD_MS } from "./constants";
import type { Game } from "./types";

/** Pause a running game, or resume a paused one. A finished game is left as it is. */
export function togglePause(game: Game): void {
  const p = game.phase;
  if (p.kind === "paused") game.phase = p.resume;
  else if (p.kind !== "over") game.phase = { kind: "paused", resume: p };
}

export function pause(game: Game): void {
  if (game.phase.kind !== "paused") togglePause(game);
}

/** A finished game that has been on screen long enough to start another from. */
export function canRestart(game: Game): boolean {
  return game.phase.kind === "over" && game.scene.time - game.phase.at >= OVER_HOLD_MS;
}
