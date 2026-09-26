/* The front page's arcade: a scene that plays itself until someone picks up
 * the controls, and then a game. The rules are `scene/` and `game/`, the
 * pictures `draw/`, the clock and the input `cabinet/`; this component
 * gives them the launches, the tip and the theme's colours, and prints what a
 * canvas cannot say — the controls, the sound switch, and the score, as text
 * a screen reader announces.
 *
 * Nothing only lives here: the catalogue below has every launch and every
 * figure. The game is a way to meet them.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useServices } from "@/app/providers/ServicesProvider";
import type { Launch } from "@/domain/launches";
import { group } from "@/ui/format";
import { reward, UNIT } from "@/domain/protocol";
import { pixelSigil } from "@/ui/pixels/sigil";
import "./arcade.css";
import { ATTRACT_HUD, type Hud, type Roster } from "./cabinet/rig";
import { mountCabinet, type Cabinet } from "./cabinet";
import type { ScenePalette } from "./draw";
import { readSoundOn, writeSoundOn } from "./prefs";
import type { InvaderSpec } from "./scene";
import { createSound, type Sound } from "./sound";

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const change = () => setMatches(list.matches);
    list.addEventListener("change", change);
    return () => list.removeEventListener("change", change);
  }, [query]);
  return matches;
}

/**
 * The theme's colours as rgb() strings the canvas is sure to accept: the
 * browser resolves each — a token reference, a color-mix — on an element, and
 * a one-pixel canvas turns whatever notation it chose into bytes.
 */
function paletteFor(host: HTMLElement, launches: readonly Launch[]): ScenePalette {
  const probe = document.createElement("span");
  probe.style.display = "none";
  host.appendChild(probe);
  const pixel = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const resolve = (css: string) => {
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
  const token = (name: string) => resolve(`var(${name})`);
  try {
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
  } finally {
    probe.remove();
  }
}

/** What the live region says: the score while playing, and each change of screen. */
function announce(hud: Hud): string {
  switch (hud.mode) {
    case "attract":
      return "";
    case "ready":
      return "Game ready. Press Space to start.";
    case "playing":
      return `Score ${group(hud.score)}. Lives ${hud.lives}. Wave ${hud.wave}.`;
    case "paused":
      return `Paused. Score ${group(hud.score)}. Hi-score ${group(hud.hi)}. Press P to resume, Escape to exit.`;
    case "over":
      return `Game over. Score ${group(hud.score)}. Hi-score ${group(hud.hi)}. Press Enter to play again, Escape to exit.`;
  }
}

const IN_GAME: ReadonlySet<Hud["mode"]> = new Set(["playing", "paused", "over"]);

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
  // The device store the preferences live in: one instance for the app, so it is safe to read once on mount.
  const { storage } = useServices();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cabinet = useRef<Cabinet | null>(null);
  const sound = useRef<Sound | null>(null);
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const touch = useMedia("(pointer: coarse)");
  const [hud, setHud] = useState<Hud>(ATTRACT_HUD);
  const [soundOn, setSoundOn] = useState(() => readSoundOn(storage));
  const playRef = useRef<HTMLButtonElement>(null);
  /** Set on leaving a game, so the focus lands on Play instead of falling to the page. */
  const refocus = useRef(false);

  // The cabinet reads the newest values without being rebuilt on every block.
  const latest = useRef({ launches, tip, onPick, reduced });
  useEffect(() => {
    latest.current = { launches, tip, onPick, reduced };
  }, [launches, tip, onPick, reduced]);
  const identity = launches.map((l) => l.id).join(",");

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const audio = createSound(readSoundOn(storage));
    sound.current = audio;

    const roster = (): Roster => {
      const list = latest.current.launches;
      const specs: InvaderSpec[] = list.map((l) => ({
        id: l.id,
        symbol: l.symbol,
        frames: pixelSigil(l.id).frames,
        reward: (clz) => {
          const now = latest.current.launches.find((x) => x.id === l.id) ?? l;
          return Number(reward(clz, now.h0, now.open ? latest.current.tip : now.h0) / UNIT);
        },
      }));
      return { specs, palette: paletteFor(host, list) };
    };

    cabinet.current = mountCabinet({
      host,
      canvas,
      reduced: latest.current.reduced,
      roster,
      nextBlock: () => latest.current.tip + 1,
      pick: (spec) => {
        const launch = latest.current.launches.find((l) => l.id === spec.id);
        if (launch) latest.current.onPick(launch);
      },
      report: setHud,
      exited: () => {
        refocus.current = true;
      },
      sound: audio,
      store: storage,
    });
    return () => {
      cabinet.current?.dispose();
      cabinet.current = null;
      audio.dispose();
      sound.current = null;
    };
  }, []);

  useEffect(() => cabinet.current?.recast(), [identity]);
  useEffect(() => {
    if (hud.mode !== "attract" || !refocus.current) return;
    refocus.current = false;
    // Only when the focus fell to the page: a click elsewhere keeps its target.
    if (document.activeElement === document.body || document.activeElement === null) playRef.current?.focus();
  }, [hud.mode]);
  useEffect(() => cabinet.current?.setReduced(reduced), [reduced]);

  const toggleSound = useCallback(() => {
    const on = !soundOn;
    // Inside the click, so the browser lets the audio start.
    sound.current?.setEnabled(on);
    writeSoundOn(storage, on);
    setSoundOn(on);
  }, [soundOn, storage]);

  const count = launches.length;
  const playing = IN_GAME.has(hud.mode);
  const keysHint = touch ? "Drag to move · tap to fire" : playing ? "← → move · SPACE fire · P pause · ESC exit" : "← → move · SPACE fire · P pause";
  const label =
    count === 0
      ? "Arcade: waiting for the first launch."
      : playing
        ? `Space invaders game. ${touch ? "Drag to move the cannon and tap to fire." : "Left and right arrows move, Space fires, P pauses, Escape exits."} Each hit scores the tokens that hash would mint on that launch.`
        : `Arcade: ${count} launch${count === 1 ? "" : "es"} as invaders and a Bitcoin cannon firing hashes. Press Space or Enter to play; click an invader to open its launch.`;

  return (
    <div className={`stage-screen crt arcade${playing ? " in-game" : ""}`} data-mode={hud.mode} ref={hostRef}>
      <canvas ref={canvasRef} tabIndex={0} role="application" aria-label={label} aria-roledescription="game" />
      <div className="arcade-bar">
        {hud.mode === "attract" && count > 0 ? (
          <button type="button" className="arcade-btn" ref={playRef} onClick={() => canvasRef.current?.focus()}>
            <span aria-hidden="true">▶ </span>Play
          </button>
        ) : null}
        {playing ? (
          <button
            type="button"
            className="arcade-btn arcade-exit"
            // Keep the game's focus until the click lands: a blur would first pause the game, or end a finished one under the pointer.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => cabinet.current?.exit()}
          >
            <span aria-hidden="true">✕ </span>Exit
          </button>
        ) : null}
        <span className="arcade-keys">{keysHint}</span>
        <span className="arcade-note">Score = tokens your hashes mint</span>
        <button
          type="button"
          className="arcade-btn"
          aria-pressed={soundOn}
          // Keep focus on the game: toggling sound mid-wave should not pause it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleSound}
        >
          <span aria-hidden="true">♪ </span>Sound {soundOn ? "on" : "off"}
        </button>
      </div>
      <p className="arcade-live" role="status" aria-live="polite" data-score={hud.score}>
        {announce(hud)}
      </p>
    </div>
  );
}
