/* React binding for `MiningSession`, resumable per ticket.
 *
 * Keeps the imperative session out of the views: a component asks to start or
 * pause and renders the state it gets back. The session is held in a ref because
 * it is a long-lived object with device handles — putting it in state would tear
 * down and recreate a GPU device on every render.
 *
 * The search on a ticket outlives any one run: how far it has gone and the best
 * hash it found are kept per ticket (`lib/mining/progress.ts`), so pausing,
 * reloading or coming back tomorrow continues the same sweep instead of
 * starting it again at nonce 0.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  absorb,
  browserProgressStore,
  EMPTY_SAMPLE,
  MiningSession,
  NO_PROGRESS,
  type BackendAvailability,
  type BackendChoice,
  type Candidate,
  type MiningSample,
  type ProgressStore,
  type TicketProgress,
} from "../lib/mining";

/** Improvements kept for the log. Older ones are of no further interest. */
const LOG_LIMIT = 16;

/** Least time between writes while mining. A reload loses at most this much work, and redoes it. */
const SAVE_MS = 1000;

/** What to mine: a ticket's challenge and the key its progress is kept under. */
export interface MiningTarget {
  key: string;
  challenge: Uint8Array;
}

export interface UseMiningSession {
  sample: MiningSample;
  /** Improvements this run, newest first. */
  log: Candidate[];
  running: boolean;
  /** The whole search on this ticket: nonces tried and best hash, across every run. */
  progress: TicketProgress;
  /** Set when a backend could not be used, or refused its own result. */
  notice: string | null;
  choice: BackendChoice;
  setChoice: (choice: BackendChoice) => void;
  /** What each backend says about itself; empty until the probe resolves. */
  backends: BackendAvailability[];
  /** Start, or continue from where the search on this ticket stopped. */
  start: () => void;
  /** Pause: stop the devices and keep the progress. */
  stop: () => void;
}

export function useMiningSession(target: MiningTarget | null, store: ProgressStore = browserProgressStore): UseMiningSession {
  const [sample, setSample] = useState<MiningSample>(EMPTY_SAMPLE);
  const [log, setLog] = useState<Candidate[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<TicketProgress>(NO_PROGRESS);
  const [notice, setNotice] = useState<string | null>(null);
  const [choice, setChoice] = useState<BackendChoice>("auto");
  const [backends, setBackends] = useState<BackendAvailability[]>([]);
  const sessionRef = useRef<MiningSession | null>(null);
  // Mirrors `progress` so a sample can be folded and saved in the same step,
  // outside a state updater (which must stay free of side effects).
  const progressRef = useRef<TicketProgress>(NO_PROGRESS);
  const savedAt = useRef(0);

  useEffect(() => {
    let live = true;
    void MiningSession.probe().then((probed) => {
      if (live) setBackends(probed);
    });
    return () => {
      live = false;
    };
  }, []);

  const save = useCallback(() => {
    if (!target) return;
    savedAt.current = performance.now();
    store.write(target.key, progressRef.current, target.challenge);
  }, [target, store]);

  const stop = useCallback(() => {
    const wasRunning = sessionRef.current !== null;
    sessionRef.current?.stop();
    sessionRef.current = null;
    setRunning(false);
    if (wasRunning) save();
  }, [save]);

  // A new ticket: load its search. The cleanup pauses the old one first, so its
  // last progress is saved under its own key and no worker keeps grinding it.
  useEffect(() => {
    const loaded = target ? store.read(target.key, target.challenge) : NO_PROGRESS;
    progressRef.current = loaded;
    setProgress(loaded);
    setSample(EMPTY_SAMPLE);
    setLog([]);
    return stop;
  }, [target, store, stop]);

  // Closing or reloading the tab mid-run: save what the last sample showed.
  useEffect(() => {
    if (!running) return;
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [running, save]);

  const start = useCallback(() => {
    if (!target) return;
    stop();
    setLog([]);
    setNotice(null);
    setSample(EMPTY_SAMPLE);

    const session = new MiningSession({
      onSample: (next) => {
        setSample(next);
        const before = progressRef.current;
        const after = absorb(before, next.frontier, next.best);
        if (after === before) return;
        progressRef.current = after;
        setProgress(after);
        // A new best is saved at once; the nonce count only every SAVE_MS.
        if (after.best !== before.best || performance.now() - savedAt.current >= SAVE_MS) save();
      },
      onImprovement: (candidate) => {
        setLog((prev) => [candidate, ...prev].slice(0, LOG_LIMIT));
      },
      onFallback: setNotice,
    });
    sessionRef.current = session;
    setRunning(true);

    session.start(target.challenge, choice, progressRef.current.next).catch((err: unknown) => {
      setNotice(err instanceof Error ? err.message : String(err));
      stop();
    });
  }, [target, choice, stop, save]);

  return { sample, log, running, progress, notice, choice, setChoice, backends, start, stop };
}
