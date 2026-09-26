/* The cabinet's pointer: in the attract mode it names and opens launches (hover
 * lights an invader, a click or a second tap on it opens that launch); in a
 * game a finger or a held button steers the cannon and fires.
 */

import { canRestart } from "../game";
import { invaderAt } from "../scene/geometry";
import { dpr, draw, resume, startGame } from "./loop";
import type { Rig } from "./rig";

function cellAt(rig: Rig, e: PointerEvent): readonly [number, number] {
  const rect = rig.canvas.getBoundingClientRect();
  return [((e.clientX - rect.left) * dpr() - rig.ox) / rig.s, ((e.clientY - rect.top) * dpr()) / rig.s] as const;
}

function invaderUnder(rig: Rig, e: PointerEvent): number {
  if (rig.state.mode === "game") return -1;
  const [x, y] = cellAt(rig, e);
  return invaderAt(rig.state.scene, x, y);
}

export function pointerdown(rig: Rig, e: PointerEvent): void {
  rig.pointer = e.pointerType === "touch" ? "touch" : rig.pointer;
  rig.pressedIn = rig.state.mode;
  rig.o.sound.unlock();
  if (rig.state.mode !== "game") return;
  const game = rig.state.game;
  if (game.phase.kind === "paused") {
    resume(rig);
    return;
  }
  if (game.phase.kind === "over") {
    if (canRestart(game)) startGame(rig);
    return;
  }
  rig.canvas.setPointerCapture(e.pointerId);
  rig.finger = { id: e.pointerId, x: cellAt(rig, e)[0] };
  rig.fireQueued = true;
}

export function pointermove(rig: Rig, e: PointerEvent): void {
  if (rig.state.mode === "game") {
    if (rig.finger?.id === e.pointerId) rig.finger.x = cellAt(rig, e)[0];
    return;
  }
  if (e.pointerType === "touch") return;
  rig.hovered = invaderUnder(rig, e);
  rig.canvas.classList.toggle("pointing", rig.hovered >= 0);
  if (!rig.raf) draw(rig);
}

export function pointerup(rig: Rig, e: PointerEvent): void {
  if (rig.finger?.id === e.pointerId) rig.finger = null;
  const began = rig.pressedIn;
  rig.pressedIn = null;
  if (rig.state.mode === "game") return;
  if (began === "ready") {
    startGame(rig);
    return;
  }
  const hit = invaderUnder(rig, e);
  if (hit >= 0 && (e.pointerType !== "touch" || rig.hovered === hit)) {
    rig.o.pick(rig.state.scene.specs[rig.state.scene.invaders[hit].spec]);
    return;
  }
  rig.hovered = hit;
  if (!rig.raf) draw(rig);
}

export function pointerleave(rig: Rig): void {
  rig.hovered = -1;
  rig.canvas.classList.remove("pointing");
  if (!rig.raf) draw(rig);
}

export function pointercancel(rig: Rig, e: PointerEvent): void {
  if (rig.finger?.id === e.pointerId) rig.finger = null;
}
