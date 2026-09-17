/* A launch's public figures, read from CKB.
 *
 * Supply is the sum of every live cell of the token's xUDT, and holders and
 * miners are counts of live token cells and miner cells. They come from a CKB
 * indexer through CCC, not from the btc.fun index, so a figure shown on a
 * launch page is one anyone can recompute with a CKB node.
 *
 * Counts are of cells, which are not people: one person may hold several cells,
 * and several people could share a wallet. The labels say "cells".
 */

import { useEffect, useMemo, useState } from "react";
import { ccc } from "@ckb-ccc/core";

import type { Launch } from "../data/launches";
import { ACTIVE_RGBPP } from "../lib/rgbpp/config";
import { ckbClient } from "../lib/rgbpp/ckb";
import { decodeAmount } from "../lib/rgbpp/operations";
import { mintScript, tokenScript, type LaunchTerms } from "../lib/rgbpp/launch";

const POLL_MS = 60_000;
/** Enough for any launch this demo will see; a larger one says "at least". */
const CELL_LIMIT = 2_000;

export interface LaunchStats {
  supply: bigint;
  tokenCells: number;
  minerCells: number;
  /** True when a count hit the read limit, so the figure is a lower bound. */
  truncated: boolean;
}

async function count(script: ccc.Script, onCell: (cell: ccc.Cell) => void): Promise<boolean> {
  let seen = 0;
  for await (const cell of ckbClient().findCellsByType(script, true)) {
    onCell(cell);
    if (++seen >= CELL_LIMIT) return true;
  }
  return false;
}

/** One read of a launch's figures from a CKB indexer. */
export async function readLaunchStats(terms: LaunchTerms): Promise<LaunchStats> {
  const mint = mintScript(ACTIVE_RGBPP, terms);
  const token = tokenScript(ACTIVE_RGBPP, mint);
  let supply = 0n;
  let tokenCells = 0;
  let minerCells = 0;
  const tokensCut = await count(token, (cell) => {
    supply += decodeAmount(cell.outputData);
    tokenCells++;
  });
  const minersCut = await count(mint, () => {
    minerCells++;
  });
  return { supply, tokenCells, minerCells, truncated: tokensCut || minersCut };
}

export function useLaunchStats(launch: Launch | undefined): { stats: LaunchStats | null; error: string | null } {
  const [stats, setStats] = useState<LaunchStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const terms = launch?.terms;

  useEffect(() => {
    setStats(null);
    if (!terms) return;
    let live = true;
    const read = async () => {
      try {
        const next = await readLaunchStats(terms);
        if (live) {
          setStats(next);
          setError(null);
        }
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void read();
    const timer = setInterval(() => void read(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [terms]);

  return { stats, error };
}

/**
 * The same figures for every launch in a catalogue, keyed by launch id.
 *
 * Read one launch after another rather than all at once: a catalogue of a few
 * dozen launches would otherwise open a few dozen indexer queries in the same
 * instant. A launch whose read fails is simply absent — its box shows a dash,
 * and the rest of the catalogue is unaffected.
 */
export function useLaunchesStats(launches: readonly Launch[]): ReadonlyMap<string, LaunchStats> {
  const [stats, setStats] = useState<ReadonlyMap<string, LaunchStats>>(new Map());
  // Launches are re-resolved on every new tip, but the reads depend only on
  // which launches exist; keying on their ids keeps a new block from
  // restarting every read.
  const key = launches.map((l) => l.id).join(",");
  const targets = useMemo(() => launches.map((l) => ({ id: l.id, terms: l.terms })), [key]);

  useEffect(() => {
    if (targets.length === 0) return;
    let live = true;
    const read = async () => {
      for (const { id, terms } of targets) {
        if (!live) return;
        try {
          const next = await readLaunchStats(terms);
          if (live) setStats((prev) => new Map(prev).set(id, next));
        } catch {
          // One unreadable launch must not blank the others.
        }
      }
    };
    void read();
    const timer = setInterval(() => void read(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [targets]);

  return stats;
}
