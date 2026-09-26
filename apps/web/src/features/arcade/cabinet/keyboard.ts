/* The cabinet's keyboard and focus: keys are only heard while the canvas has
 * focus, so the rest of the page scrolls and types as usual. Taking the focus
 * puts a player at the controls (ready); letting it go pauses a game rather
 * than playing on without them.
 */

import { canRestart, pause, togglePause, type Game } from "../game";
import { exit, releaseAll, resume, startGame, sync, toAttract } from "./loop";
import type { Rig } from "./rig";

/** What a menu key does in a game: Escape leaves it, P pauses and resumes it, and a finished game has nothing to pause. */
export type MenuCommand = "exit" | "pause" | "resume";

export function menuCommand(key: string, phase: Game["phase"]["kind"]): MenuCommand | null {
  if (key === "Escape") return "exit";
  if (key !== "p" && key !== "P") return null;
  if (phase === "over") return null;
  return phase === "paused" ? "resume" : "pause";
}

const MOVE_LEFT = new Set(["ArrowLeft", "a", "A"]);
const MOVE_RIGHT = new Set(["ArrowRight", "d", "D"]);

export function keydown(rig: Rig, e: KeyboardEvent): void {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  rig.pointer = "keys";
  rig.o.sound.unlock();
  const key = e.key;
  const fire = key === " " || key === "Spacebar";
  if (rig.state.mode !== "game") {
    if (fire || key === "Enter") {
      e.preventDefault();
      startGame(rig);
    } else if (key === "Escape") {
      e.preventDefault();
      exit(rig);
    }
    return;
  }
  const game = rig.state.game;
  const phase = game.phase.kind;
  if (MOVE_LEFT.has(key) || MOVE_RIGHT.has(key) || key === "ArrowUp" || key === "ArrowDown") {
    e.preventDefault();
    if (MOVE_LEFT.has(key)) rig.keys.left = true;
    if (MOVE_RIGHT.has(key)) rig.keys.right = true;
    return;
  }
  if (fire || key === "Enter") {
    e.preventDefault();
    if (phase === "over") {
      if (canRestart(game) && !e.repeat) startGame(rig);
    } else if (phase === "paused") {
      if (!e.repeat) resume(rig);
    } else if (fire) {
      rig.keys.fire = true;
      if (!e.repeat) rig.fireQueued = true;
    }
    return;
  }
  const command = menuCommand(key, phase);
  if (command) e.preventDefault();
  if (command === "exit") exit(rig);
  else if (command === "resume") resume(rig);
  else if (command === "pause") {
    togglePause(game);
    releaseAll(rig);
    sync(rig);
  }
}

export function keyup(rig: Rig, e: KeyboardEvent): void {
  if (MOVE_LEFT.has(e.key)) rig.keys.left = false;
  if (MOVE_RIGHT.has(e.key)) rig.keys.right = false;
  if (e.key === " " || e.key === "Spacebar") rig.keys.fire = false;
}

export function focus(rig: Rig): void {
  // With no launch there is no formation, so nothing to play yet.
  if (rig.state.mode === "attract" && rig.state.scene.invaders.length > 0) {
    rig.state = { ...rig.state, mode: "ready" };
    sync(rig);
  }
}

export function blur(rig: Rig): void {
  releaseAll(rig);
  if (rig.state.mode === "ready") {
    rig.state = { ...rig.state, mode: "attract" };
    sync(rig);
  } else if (rig.state.mode === "game") {
    if (rig.state.game.phase.kind === "over") toAttract(rig);
    else {
      pause(rig.state.game);
      sync(rig);
    }
  }
}
