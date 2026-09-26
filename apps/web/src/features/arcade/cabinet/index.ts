/* The cabinet: what joins the rules to a canvas, a clock and a player.
 *
 * Three modes. Attract plays itself (`scene/`) and points at launches.
 * Ready is the same scene holding for a player who has picked up the controls
 * — the canvas has focus — until Space, Enter or a tap. Game is `game.ts`.
 *
 * The clock is a fixed step: however the frames arrive, the rules advance in
 * equal slices, so a game plays the same at 60 Hz and 144 Hz. It stops when
 * nothing moves — the scene scrolled away, the tab hidden, a paused game, the
 * attract mode under reduced motion — and a game in progress pauses rather
 * than carrying on unseen. Keys are only heard while the canvas has focus, so
 * the rest of the page scrolls and types as usual.
 *
 * Escape always leaves: a game ends and the cabinet goes back to attracting,
 * with the focus let go. P is the pause. One key per meaning, so nobody has to
 * learn which screen turns Escape into a pause.
 *
 * The parts: `rig.ts` is the state they share, `loop.ts` the clock, drawing
 * and the moves between modes, `keyboard.ts` and `pointer.ts` the two ways a
 * player drives it. This file mounts them on a canvas and takes them down.
 */

import { readHiScore } from "../prefs";
import { blur, focus, keydown, keyup } from "./keyboard";
import { attractScene, draw, exit, fitGame, stop, sync, toAttract } from "./loop";
import { pointercancel, pointerdown, pointerleave, pointermove, pointerup } from "./pointer";
import { ATTRACT_HUD, type CabinetOptions, type Rig, type RigBase } from "./rig";

export { menuCommand, type MenuCommand } from "./keyboard";
export { BAR_CSS } from "./loop";
export { ATTRACT_HUD, type CabinetOptions, type Hud, type Roster } from "./rig";

export interface Cabinet {
  /** The launches changed: rebuild the attract scene; a game in progress keeps its own. */
  recast(): void;
  /** Leave whatever is on — a game, a player waiting at the controls — for the attract mode. */
  exit(): void;
  setReduced(reduced: boolean): void;
  dispose(): void;
}

export function mountCabinet(o: CabinetOptions): Cabinet {
  const { host, canvas } = o;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { recast() {}, exit() {}, setReduced() {}, dispose() {} };

  const base: RigBase = {
    o,
    host,
    canvas,
    ctx,
    reduced: o.reduced,
    s: 1,
    ox: 0,
    raf: 0,
    last: 0,
    pending: 0,
    onScreen: true,
    hovered: -1,
    pointer: window.matchMedia("(pointer: coarse)").matches ? "touch" : "keys",
    keys: { left: false, right: false, fire: false },
    finger: null,
    fireQueued: false,
    pressedIn: null,
    reported: ATTRACT_HUD,
    hi: readHiScore(),
  };

  const rig: Rig = Object.assign(base, { state: { mode: "attract" as const, ...attractScene(base) } });

  const resize = new ResizeObserver(() => {
    if (rig.state.mode === "game") {
      fitGame(rig, rig.state.game);
      draw(rig);
    } else {
      const mode = rig.state.mode;
      rig.state = { mode, ...attractScene(rig) };
      sync(rig);
    }
  });
  const seen = new IntersectionObserver(([entry]) => {
    rig.onScreen = entry.isIntersecting;
    sync(rig);
  });

  // One bound handler per event, so the same function is added and removed.
  const onVisibility = () => sync(rig);
  const onKeydown = (e: KeyboardEvent) => keydown(rig, e);
  const onKeyup = (e: KeyboardEvent) => keyup(rig, e);
  const onFocus = () => focus(rig);
  const onBlur = () => blur(rig);
  const onPointerdown = (e: PointerEvent) => pointerdown(rig, e);
  const onPointermove = (e: PointerEvent) => pointermove(rig, e);
  const onPointerup = (e: PointerEvent) => pointerup(rig, e);
  const onPointerleave = () => pointerleave(rig);
  const onPointercancel = (e: PointerEvent) => pointercancel(rig, e);

  resize.observe(host);
  seen.observe(host);
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("keydown", onKeydown);
  canvas.addEventListener("keyup", onKeyup);
  canvas.addEventListener("focus", onFocus);
  canvas.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onPointerdown);
  canvas.addEventListener("pointermove", onPointermove);
  canvas.addEventListener("pointerup", onPointerup);
  canvas.addEventListener("pointerleave", onPointerleave);
  canvas.addEventListener("pointercancel", onPointercancel);
  sync(rig);

  return {
    recast() {
      if (rig.state.mode !== "game") toAttract(rig, rig.state.mode);
    },
    exit: () => exit(rig),
    setReduced(next) {
      if (next === rig.reduced) return;
      rig.reduced = next;
      if (rig.state.mode !== "game") toAttract(rig, rig.state.mode);
    },
    dispose() {
      stop(rig);
      resize.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("keydown", onKeydown);
      canvas.removeEventListener("keyup", onKeyup);
      canvas.removeEventListener("focus", onFocus);
      canvas.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onPointerdown);
      canvas.removeEventListener("pointermove", onPointermove);
      canvas.removeEventListener("pointerup", onPointerup);
      canvas.removeEventListener("pointerleave", onPointerleave);
      canvas.removeEventListener("pointercancel", onPointercancel);
    },
  };
}
