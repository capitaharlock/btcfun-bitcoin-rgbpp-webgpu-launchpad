/* The game's sound: square-wave bleeps and noise, the way the cabinet made them.
 *
 * Off until the player turns it on, and silent in the attract mode whatever
 * the setting: nothing here ever plays on its own. The audio context is made
 * on the first gesture that needs it, because browsers refuse one made
 * earlier, and it is closed when the arcade is taken off the page.
 */

import type { GameEvent } from "./game";

/** The march's four descending bass notes, in Hz: the original's heartbeat. */
const MARCH = [98, 87.3, 77.8, 73.4] as const;

export interface Sound {
  readonly enabled: boolean;
  setEnabled(on: boolean): void;
  /** Make or wake the audio context; call from a key or pointer handler. */
  unlock(): void;
  play(event: GameEvent): void;
  dispose(): void;
}

export function createSound(initially: boolean): Sound {
  let enabled = initially;
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;

  const context = (): AudioContext | null => {
    if (!enabled) return null;
    if (!ctx) {
      const Ctor = window.AudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      noise = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  };

  /** One note: a waveform sliding from `from` to `to` Hz over `ms`, with a hard attack and a quick decay. */
  const tone = (type: OscillatorType, from: number, to: number, ms: number, gain: number, delay = 0) => {
    const a = context();
    if (!a) return;
    const t0 = a.currentTime + delay / 1000;
    const t1 = t0 + ms / 1000;
    const osc = a.createOscillator();
    const amp = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t1);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(amp).connect(a.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  };

  const hiss = (ms: number, gain: number, cutoff: number) => {
    const a = context();
    if (!a || !noise) return;
    const t0 = a.currentTime;
    const t1 = t0 + ms / 1000;
    const src = a.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = a.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(80, t1);
    const amp = a.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t1);
    src.connect(filter).connect(amp).connect(a.destination);
    src.start(t0);
    src.stop(t1 + 0.02);
  };

  const arpeggio = (notes: readonly number[], step: number, gain: number) =>
    notes.forEach((f, i) => tone("square", f, f, step, gain, i * step));

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      if (on) context();
      else void ctx?.suspend();
    },
    unlock() {
      context();
    },
    play(event) {
      if (!enabled) return;
      switch (event.kind) {
        case "march":
          tone("square", MARCH[event.beat % MARCH.length], MARCH[event.beat % MARCH.length] * 0.94, 90, 0.09);
          break;
        case "fire":
          tone("square", 1200, 240, 110, 0.035);
          break;
        case "hit":
          hiss(160, 0.12, 3000);
          tone("square", 520, 90, 140, 0.03);
          break;
        case "ufo":
          for (let i = 0; i < 6; i++) tone("triangle", 660, 990, 120, 0.04, i * 120);
          break;
        case "ufoHit":
          arpeggio([523, 659, 784, 1047, 1319], 70, 0.04);
          break;
        case "playerHit":
          hiss(900, 0.2, 1800);
          tone("sawtooth", 220, 40, 700, 0.05);
          break;
        case "wave":
          arpeggio([262, 330, 392, 523], 90, 0.035);
          break;
        case "extraLife":
          arpeggio([784, 988, 1175, 1568], 60, 0.035);
          break;
        case "over":
          arpeggio([392, 330, 262, 196], 180, 0.045);
          break;
      }
    },
    dispose() {
      void ctx?.close();
      ctx = null;
    },
  };
}
