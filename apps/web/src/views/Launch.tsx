import { useEffect, useMemo, useRef, useState } from "react";
import { navigate } from "../App";
import { getLaunch, stateTone } from "../data/launches";
import { budget, cumulative, maxAtoms, MILESTONES } from "../lib/emission";
import { challengeDigest, fakeBlockHash, type ChallengeFields } from "../lib/challenge";
import { Miner, expectedClz, gpuSupport, weightOf, type GpuSupport, type MinerSample } from "../lib/miner";
import { EmissionChart } from "../ui/EmissionChart";
import { Chip, KV, Meter, Notice, Panel, Stat } from "../ui/primitives";
import { atoms, blocksAsTime, duration, group, pct, rate, shortHash, splitLeadingZeros } from "../lib/format";

const IDLE: MinerSample = {
  hashes: 0,
  hashRate: 0,
  bestClz: -1,
  bestNonce: 0,
  bestHash: "",
  elapsedMs: 0,
  workers: 0,
  backend: "cpu-workers",
};

export function LaunchView({ id }: { id: string }) {
  const launch = getLaunch(id);
  const [sample, setSample] = useState<MinerSample>(IDLE);
  const [mining, setMining] = useState(false);
  const [gpu, setGpu] = useState<GpuSupport | null>(null);
  const [log, setLog] = useState<Array<{ clz: number; hash: string; nonce: number }>>([]);
  const minerRef = useRef<Miner | null>(null);
  const bestSeen = useRef(-1);

  const epochIndex = launch ? Math.floor(launch.elapsed / launch.epochBlocks) : 0;

  const fields = useMemo<ChallengeFields | null>(() => {
    if (!launch) return null;
    return {
      version: "btcfun/0.1-prototype",
      network: "signet",
      launch: launch.id,
      epoch: epochIndex,
      btcBlockHash: fakeBlockHash(launch.h0 + epochIndex * launch.epochBlocks),
      ticket: "ticket-prototype-0001",
      owner: "tb1q…prototype-recipient",
    };
  }, [launch, epochIndex]);

  const challenge = useMemo(() => (fields ? challengeDigest(fields) : null), [fields]);

  useEffect(() => {
    void gpuSupport().then(setGpu);
    return () => minerRef.current?.stop();
  }, []);

  useEffect(() => {
    if (sample.bestClz > bestSeen.current && sample.bestHash) {
      bestSeen.current = sample.bestClz;
      setLog((prev) =>
        [{ clz: sample.bestClz, hash: sample.bestHash, nonce: sample.bestNonce }, ...prev].slice(0, 14),
      );
    }
  }, [sample.bestClz, sample.bestHash, sample.bestNonce]);

  if (!launch || !challenge) {
    return (
      <Panel title="Launch not found">
        <button className="btn" onClick={() => navigate("/")}>Back to launches</button>
      </Panel>
    );
  }

  const start = () => {
    bestSeen.current = -1;
    setLog([]);
    const miner = new Miner(setSample);
    minerRef.current = miner;
    miner.start(challenge);
    setMining(true);
  };

  const stop = () => {
    minerRef.current?.stop();
    minerRef.current = null;
    setMining(false);
  };

  const M = maxAtoms(launch.schedule);
  const scheduled = cumulative(launch.schedule, BigInt(launch.elapsed));
  const epochBudget = budget(
    launch.schedule,
    BigInt(epochIndex * launch.epochBlocks),
    BigInt((epochIndex + 1) * launch.epochBlocks),
  );
  const blocksIntoEpoch = launch.elapsed % launch.epochBlocks;
  const blocksLeft = launch.epochBlocks - blocksIntoEpoch;
  const schedFrac = Number((scheduled * 10000n) / M) / 10000;
  const mintedFrac = Number((launch.liabilities * 10000n) / M) / 10000;
  const expiredFrac = Math.max(0, schedFrac - mintedFrac);
  const { zeros, rest } = splitLeadingZeros(sample.bestHash || "");

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <button className="btn ghost" onClick={() => navigate("/")}>← Launches</button>
        <span className="spacer" />
        <Chip tone={stateTone(launch.state)} live={launch.state === "mining"}>{launch.state}</Chip>
        <Chip>epoch {epochIndex}</Chip>
        <Chip tone="cyan">{blocksLeft} blk to close</Chip>
      </div>

      <section className="split">
        <Panel>
          <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
            <span
              style={{
                width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center",
                background: `color-mix(in oklab, ${launch.accent} 20%, var(--surface-3))`,
                boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${launch.accent} 40%, transparent)`,
                fontFamily: "var(--mono)", color: launch.accent, fontSize: 15,
              }}
            >
              {launch.symbol.slice(0, 2)}
            </span>
            <div>
              <h1 style={{ fontSize: 30 }}>{launch.symbol}</h1>
              <p style={{ margin: "2px 0 0" }}>{launch.name} — {launch.blurb}</p>
            </div>
          </div>

          <div className="rule" />

          <div className="statrow">
            <Stat k="scheduled" v={pct(schedFrac)} tone="amber" hint="Share of max supply the schedule has offered" />
            <Stat k="minted" v={pct(mintedFrac)} />
            <Stat k="expired" v={pct(expiredFrac)} tone="danger" hint="Allowance that closed unmined — permanent" />
            <Stat k="addresses" v={group(launch.addresses)} hint="Addresses, not people (PROTOCOL.md §2)" />
          </div>

          <div style={{ marginTop: 16 }}>
            <Meter value={schedFrac} />
            <div className="row tiny faint" style={{ marginTop: 6 }}>
              <span>block offset {group(launch.elapsed)}</span>
              <span className="spacer" />
              <span>{blocksAsTime(launch.elapsed)} since h₀ {group(launch.h0)}</span>
            </div>
          </div>
        </Panel>

        <Panel eyebrow="this epoch" title="Allowance">
          <KV
            rows={[
              ["Epoch budget", `${atoms(epochBudget, launch.schedule.decimals, 2)} ${launch.symbol}`],
              ["Epoch length", `${launch.epochBlocks} blocks`],
              ["Closes in", `${blocksLeft} blk · ${blocksAsTime(blocksLeft)}`],
              ["Ticket price", `${atoms(launch.ticketPrice, 8, 4)} reserve`],
              ["Reserve", atoms(launch.reserve, 8, 2)],
            ]}
          />
          <div className="rule" />
          <Notice tone="cyan">
            Allocation across admitted work is <b>not adopted</b>. The candidate
            in PROTOCOL.md §4.3 caps minting at{" "}
            <span className="mono">floor(ΔR × S / R)</span> so a quiet epoch cannot
            dilute existing backing. See the <a href="#/lab">emission lab</a>.
          </Notice>
        </Panel>
      </section>

      {/* ---------------- the miner ---------------- */}
      <Panel
        eyebrow="proof of work"
        title="Mine"
        aside={
          <div className="row">
            <Chip tone={mining ? "amber" : undefined} live={mining}>
              {mining ? `${sample.workers} workers` : "idle"}
            </Chip>
            {gpu && (
              <Chip tone={gpu.available ? "cyan" : undefined}>
                webgpu {gpu.available ? "detected" : "unavailable"}
              </Chip>
            )}
          </div>
        }
      >
        <div className="split" style={{ alignItems: "start" }}>
          <div className="stack-md">
            <div className="statrow">
              <Stat k="hash rate" v={rate(sample.hashRate)} tone="amber" />
              <Stat k="attempts" v={group(sample.hashes)} small />
              <Stat k="elapsed" v={duration(sample.elapsedMs)} small />
              <Stat
                k="best clz"
                v={sample.bestClz < 0 ? "—" : sample.bestClz}
                unit={sample.bestClz >= 0 ? "bits" : undefined}
                tone="cyan"
              />
            </div>

            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>best candidate</div>
              <div className="hash">
                {sample.bestHash ? (
                  <>
                    <span className="z">{zeros}</span>
                    {rest}
                  </>
                ) : (
                  <span className="faint">no candidate yet — press mine</span>
                )}
              </div>
              {sample.bestHash && (
                <div className="row tiny faint" style={{ marginTop: 8, gap: 16 }}>
                  <span>nonce <span className="mono">{group(sample.bestNonce)}</span></span>
                  <span>
                    weight clz² = <span className="mono">{weightOf(sample.bestClz)}</span>
                  </span>
                  <span>
                    expected clz at {group(sample.hashes)} attempts ={" "}
                    <span className="mono">{expectedClz(sample.hashes).toFixed(1)}</span>
                  </span>
                </div>
              )}
            </div>

            <div className="row">
              {mining ? (
                <button className="btn lg" onClick={stop}>Stop</button>
              ) : (
                <button className="btn primary lg" onClick={start}>Mine</button>
              )}
              <button className="btn ghost" onClick={() => navigate(`/launch/${launch.id}/proof`)}>
                Verify evidence →
              </button>
            </div>

            <Notice>
              This grinder is a <b>measurement harness</b> for task V7, not an
              admitted submission path. Ticket admission, challenge disclosure
              timing and replay prevention are unresolved (PROTOCOL.md §4.2), so a
              candidate found here proves nothing about entitlement.
            </Notice>
          </div>

          <div className="stack-md">
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>improvement log</div>
              <div className="hashwall">
                {log.length === 0 && <div className="faint">awaiting first candidate…</div>}
                {log.map((entry, i) => (
                  <div key={`${entry.nonce}-${i}`}>
                    <b>{String(entry.clz).padStart(2, "0")}</b>{" "}
                    <span>{shortHash(entry.hash, 22, 10)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>canonical challenge</div>
              <KV
                rows={[
                  ["version", fields!.version],
                  ["network", fields!.network],
                  ["epoch", String(fields!.epoch)],
                  ["btc block", shortHash(fields!.btcBlockHash, 10, 6)],
                  ["ticket", fields!.ticket],
                ]}
              />
            </div>
          </div>
        </div>
      </Panel>

      <Panel eyebrow="schedule" title="Issuance ceiling and this launch's position">
        <EmissionChart
          schedule={launch.schedule}
          spanBlocks={12096n}
          cursor={BigInt(launch.elapsed)}
          markers={MILESTONES.map((m) => ({ at: m.blocks, label: m.label }))}
          height={210}
        />
      </Panel>
    </div>
  );
}
