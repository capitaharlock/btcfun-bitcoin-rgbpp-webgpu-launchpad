/* React binding for `MiningSession`.
 *
 * Keeps the imperative session out of the views: a component asks to start or
 * stop and renders the state it gets back. The session is held in a ref because
 * it is a long-lived object with device handles — putting it in state would tear
 * down and recreate a GPU device on every render.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_SAMPLE,
  MiningSession,
  type BackendAvailability,
  type BackendChoice,
  type Candidate,
  type MiningSample,
} from "../lib/mining";

/** Improvements kept for the log. Older ones are of no further interest. */
const LOG_LIMIT = 16;

export interface UseMiningSession {
  sample: MiningSample;
  /** Improvements this run, newest first. */
  log: Candidate[];
  running: boolean;
  /** Set when a backend could not be used, or refused its own result. */
  notice: string | null;
  choice: BackendChoice;
  setChoice: (choice: BackendChoice) => void;
  /** What each backend says about itself; empty until the probe resolves. */
  backends: BackendAvailability[];
  start: () => void;
  stop: () => void;
}

export function useMiningSession(challenge: Uint8Array | null): UseMiningSession {
  const [sample, setSample] = useState<MiningSample>(EMPTY_SAMPLE);
  const [log, setLog] = useState<Candidate[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [choice, setChoice] = useState<BackendChoice>("auto");
  const [backends, setBackends] = useState<BackendAvailability[]>([]);
  const sessionRef = useRef<MiningSession | null>(null);

  useEffect(() => {
    let live = true;
    void MiningSession.probe().then((probed) => {
      if (live) setBackends(probed);
    });
    return () => {
      live = false;
    };
  }, []);

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    if (!challenge) return;
    stop();
    setLog([]);
    setNotice(null);
    setSample(EMPTY_SAMPLE);

    const session = new MiningSession({
      onSample: setSample,
      onImprovement: (candidate) => {
        setLog((prev) => [candidate, ...prev].slice(0, LOG_LIMIT));
      },
      onFallback: setNotice,
    });
    sessionRef.current = session;
    setRunning(true);

    session.start(challenge, choice).catch((err: unknown) => {
      setNotice(err instanceof Error ? err.message : String(err));
      stop();
    });
  }, [challenge, choice, stop]);

  // A new challenge invalidates every candidate found against the old one, and
  // an unmount must not leave workers or a GPU device running.
  useEffect(() => stop, [challenge, stop]);

  return { sample, log, running, notice, choice, setChoice, backends, start, stop };
}
