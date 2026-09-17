/* The front page's arcade scene: the rules in `scene.ts`, drawn by `draw.ts`,
 * run by the browser's frame clock.
 *
 * Decoration with a job: it shows, at a glance, that every launch is a thing
 * you shoot hashes at and that a hit pays in that launch's token. Nothing only
 * lives here — the catalogue below has every launch and every figure — so the
 * canvas is one labelled image to assistive technology.
 *
 * It costs nothing when nobody is looking: the loop stops when the scene is
 * scrolled away or the tab is hidden, and under prefers-reduced-motion it
 * draws one composed still frame instead of running at all.
 */

import { useEffect, useRef, useState } from "react";

import type { Launch } from "../../data/launches";
import { atoms } from "../../lib/format";
import { DECIMALS, reward } from "../../lib/standard";
import { pixelSigil } from "../pixelSigil";
import { drawScene, type ScenePalette } from "./draw";
import { createScene, invaderAt, seeded, stepScene, type InvaderSpec, type Scene } from "./scene";

/** CSS pixels per scene cell: chunkier on a large screen, finer on a phone. */
const CELL_CSS = { huge: 5, wide: 4, narrow: 3 } as const;
/** Width from which the scene uses its largest cells. */
const HUGE = 1200;
/** Width from which the headline sits over the left of the scene. */
const WIDE = 900;
/** How far the headline reaches into the scene when it overlaps it, in CSS px. */
const COPY_CSS = 640;
/** Longest step the simulation takes, so a stalled tab does not teleport it. */
const MAX_DT = 48;
/** How much time the still frame shows having passed. */
const STILL_MS = 2_600;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

/**
 * Any CSS colour — a token reference, a color-mix — as an rgb() string the
 * canvas is sure to accept: the browser resolves it on an element, and a
 * one-pixel canvas turns whatever notation it chose into bytes.
 */
function colourResolver(host: HTMLElement): (css: string) => string {
  const probe = document.createElement("span");
  probe.style.display = "none";
  host.appendChild(probe);
  const pixel = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  return (css) => {
    probe.style.color = "";
    probe.style.color = css;
    const computed = getComputedStyle(probe).color;
    if (!pixel) return computed;
    pixel.clearRect(0, 0, 1, 1);
    pixel.fillStyle = computed;
    pixel.fillRect(0, 0, 1, 1);
    const [r, g, b] = pixel.getImageData(0, 0, 1, 1).data;
    return `rgb(${r} ${g} ${b})`;
  };
}

function paletteFor(host: HTMLElement, launches: readonly Launch[]): ScenePalette {
  const resolve = colourResolver(host);
  const token = (name: string) => resolve(`var(${name})`);
  return {
    bg: token("--bg"),
    ink: token("--ink"),
    dim: token("--ink-dim"),
    faint: token("--ink-faint"),
    bitcoin: token("--amber"),
    cover: token("--play"),
    invaders: launches.map((l) => ({
      base: resolve(l.accent),
      hi: resolve(`color-mix(in oklab, ${l.accent} 45%, var(--paper))`),
    })),
  };
}

export function ArcadeScene({
  launches,
  tip,
  onPick,
}: {
  launches: readonly Launch[];
  tip: number;
  /** A launch was clicked or tapped twice. */
  onPick: (launch: Launch) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  // The loop reads the newest values without restarting on every block.
  const latest = useRef({ launches, tip, onPick });
  useEffect(() => {
    latest.current = { launches, tip, onPick };
  }, [launches, tip, onPick]);
  const identity = launches.map((l) => l.id).join(",");

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!host || !canvas || !ctx) return;

    const roster = latest.current.launches;
    const specs: InvaderSpec[] = roster.map((l) => ({
      id: l.id,
      symbol: l.symbol,
      frames: pixelSigil(l.id).frames,
      reward: (clz) => {
        const now = latest.current.launches.find((x) => x.id === l.id) ?? l;
        return atoms(reward(clz, now.h0, now.open ? latest.current.tip : now.h0), DECIMALS, 0);
      },
    }));
    const palette = paletteFor(host, roster);

    let scene: Scene | null = null;
    let s = 1;
    let hovered = -1;
    let raf = 0;
    let last = 0;
    let onScreen = true;

    const draw = () => scene && drawScene(ctx, scene, palette, s, hovered);

    const layout = () => {
      const { width, height } = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const wide = width >= WIDE;
      const cell = width >= HUGE ? CELL_CSS.huge : wide ? CELL_CSS.wide : CELL_CSS.narrow;
      s = Math.max(1, Math.round(cell * dpr));
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      const cols = Math.floor(canvas.width / s);
      const rows = Math.floor(canvas.height / s);
      const left = wide ? Math.ceil((Math.min(COPY_CSS, width * 0.5) * dpr) / s) : 4;
      scene = createScene(specs, { width: cols, height: rows, left, right: cols - 4 }, seeded(7));
      if (reduced) {
        const still = seeded(11);
        for (let t = 0; t < STILL_MS; t += 16) stepScene(scene, 16, still);
      }
      draw();
    };

    const frame = (now: number) => {
      const dt = last ? Math.min(MAX_DT, now - last) : 16;
      last = now;
      if (scene) stepScene(scene, dt, Math.random);
      draw();
      raf = requestAnimationFrame(frame);
    };
    const running = () => raf !== 0;
    const start = () => {
      if (reduced || running() || !onScreen || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const sync = () => (onScreen && !document.hidden ? start() : stop());

    const resize = new ResizeObserver(layout);
    resize.observe(host);
    const seen = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    seen.observe(host);
    document.addEventListener("visibilitychange", sync);

    // Pointing: the symbol under an invader on hover; a click opens it. On a
    // touch screen the first tap names it and a second tap on it opens it.
    const cellAt = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      return [((e.clientX - rect.left) * dpr) / s, ((e.clientY - rect.top) * dpr) / s] as const;
    };
    const point = (e: PointerEvent) => {
      if (!scene) return -1;
      const [x, y] = cellAt(e);
      return invaderAt(scene, x, y);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      hovered = point(e);
      canvas.classList.toggle("pointing", hovered >= 0);
      if (!running()) draw();
    };
    const leave = () => {
      hovered = -1;
      canvas.classList.remove("pointing");
      if (!running()) draw();
    };
    const tap = (e: PointerEvent) => {
      const hit = point(e);
      const launch = hit >= 0 ? latest.current.launches.find((l) => l.id === specs[scene!.invaders[hit].spec].id) : undefined;
      if (launch && (e.pointerType !== "touch" || hovered === hit)) {
        latest.current.onPick(launch);
        return;
      }
      hovered = hit;
      if (!running()) draw();
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointerup", tap);

    layout();
    sync();

    return () => {
      stop();
      resize.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", sync);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointerup", tap);
      host.replaceChildren(canvas);
    };
    // `identity` stands for the roster: a new block must not rebuild the scene.
  }, [identity, reduced]);

  const count = launches.length;
  return (
    <div className="stage-screen crt" ref={hostRef}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={
          count === 0
            ? "Arcade scene: a Bitcoin cannon waiting for the first launch."
            : `Arcade scene: ${count} launch${count === 1 ? "" : "es"} as invaders, and a Bitcoin cannon firing hashes at them.`
        }
      />
    </div>
  );
}
