/* One launch: what the schedule allows, what the chain says, and the loop.
 *
 * The loop is ticket, work, claim — in that order, and the order is load-
 * bearing. The challenge a miner grinds commits to the ticket's txid, so work
 * done before buying one is worth nothing against any claim. That is
 * PROTOCOL.md §4.2's anti-pre-grinding requirement expressed as a dependency
 * rather than as a rule someone has to remember.
 *
 * All three steps are checkable. The ticket is a transaction on the active
 * network. The work is re-hashed by the CPU before it is shown and again when
 * the record is replayed. The claim's amount is decided by the allocation rule.
 *
 * Fixture figures and ledger figures are shown side by side and never mixed:
 * the headline reserve is a fixture, while "your chain" is the state of records
 * this wallet actually signed. PROTOCOL.md §3 requires that distinction to be
 * visible rather than explained in a footnote.
 */

import { useMemo } from "react";

import { navigate } from "../App";
import { PROTOCOL_VERSION, stateTone, type Launch } from "../data/launches";
import { useChainSynced, useEpochBlockHash, useLaunch, useLaunchRules, useTip } from "../hooks/useLaunches";
import { useLedger } from "../hooks/useLedger";
import { useMiningSession } from "../hooks/useMiningSession";
import { useTicket } from "../hooks/useTicket";
import { budget, cumulative, maxAtoms, MILESTONES } from "../lib/emission";
import { challengeDigest, type ChallengeFields } from "../lib/challenge";
import { NETWORK, useWallet } from "../state/WalletProvider";
import { MinePanel } from "../components/mining/MinePanel";
import { ClaimPanel } from "../components/mining/ClaimPanel";
import { EmissionChart } from "../ui/EmissionChart";
import { Chip, KV, Meter, Notice, Panel, Stat } from "../ui/primitives";
import { atoms, blocksAsTime, group, pct } from "../lib/format";

export function LaunchView({ id }: { id: string }) {
  const launch = useLaunch(id);

  if (!launch) {
    return (
      <Panel title="Launch not found">
        <button className="btn" onClick={() => navigate("/")}>Back to launches</button>
      </Panel>
    );
  }

  // Remount on epoch change: a new epoch is a new challenge, a new ticket and a
  // fresh mining run, and carrying any of that across would be a bug.
  return <LaunchBody key={`${launch.id}:${launch.epoch}`} launch={launch} />;
}

function LaunchBody({ launch }: { launch: Launch }) {
  const rules = useLaunchRules(launch);
  const tip = useTip();
  const synced = useChainSynced();
  const wallet = useWallet();
  const ledger = useLedger(rules);
  const epochBlockHash = useEpochBlockHash(launch);
  const ticketing = useTicket(launch.id, launch.epoch, launch.ticketSats);

  const identity = wallet.vault?.identity ?? null;
  const ticket = ticketing.ticket;

  /**
   * The challenge, or null when a prerequisite is missing.
   *
   * Null is what disables mining. Deriving a placeholder challenge instead
   * would let someone grind millions of hashes against bytes no claim will ever
   * be validated against.
   */
  const fields = useMemo<ChallengeFields | null>(() => {
    if (!identity || !ticket || !epochBlockHash) return null;
    return {
      version: PROTOCOL_VERSION,
      network: NETWORK.id,
      launch: launch.id,
      epoch: launch.epoch,
      btcBlockHash: epochBlockHash,
      ticket: ticket.txid,
      owner: identity,
    };
  }, [identity, ticket, epochBlockHash, launch.id, launch.epoch]);

  const challenge = useMemo(() => (fields ? challengeDigest(fields) : null), [fields]);
  const mining = useMiningSession(challenge);

  const max = maxAtoms(launch.schedule);
  const scheduled = cumulative(launch.schedule, BigInt(launch.elapsed));
  const epochAllowance = budget(
    launch.schedule,
    BigInt(launch.epoch * launch.epochBlocks),
    BigInt((launch.epoch + 1) * launch.epochBlocks),
  );
  const blocksLeft = launch.epochBlocks - (launch.elapsed % launch.epochBlocks);
  const schedFrac = Number((scheduled * 10000n) / max) / 10000;
  const mintedFrac = Number((launch.liabilities * 10000n) / max) / 10000;
  const expiredFrac = Math.max(0, schedFrac - mintedFrac);
  const held = ledger.balanceOf(identity);

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <button className="btn ghost" onClick={() => navigate("/")}>← Launches</button>
        <span className="spacer" />
        <Chip tone={stateTone(launch.state)} live={launch.state === "mining"}>{launch.state}</Chip>
        {synced ? (
          <>
            <Chip>epoch {launch.epoch}</Chip>
            <Chip tone="cyan">{blocksLeft} blk · {blocksAsTime(blocksLeft)} to close</Chip>
          </>
        ) : (
          // Until the provider answers, every figure below is computed against a
          // stand-in height. Say so, and dim them, rather than show them as fact.
          <Chip live>reading the chain…</Chip>
        )}
      </div>

      <section className={synced ? "split" : "split syncing"} aria-busy={!synced}>
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
            <Stat k="minted" v={pct(mintedFrac)} hint="Fixture figure, not this chain" />
            <Stat k="expired" v={pct(expiredFrac)} tone="danger" hint="Allowance that closed unmined — permanent" />
            <Stat k="addresses" v={group(launch.addresses)} hint="Fixture. Addresses, not people (§2)" />
          </div>

          <div style={{ marginTop: 16 }}>
            <Meter value={schedFrac} />
            <div className="row tiny faint" style={{ marginTop: 6 }}>
              <span>block offset {group(launch.elapsed)}</span>
              <span className="spacer" />
              <span>h₀ {group(launch.h0)} · tip {group(tip)}</span>
            </div>
          </div>
        </Panel>

        <Panel eyebrow="your chain" title="Signed records">
          <KV
            rows={[
              ["You hold", `${atoms(held, launch.schedule.decimals, 4)} ${launch.symbol}`],
              ["Chain supply", atoms(ledger.state?.supply ?? 0n, launch.schedule.decimals, 4)],
              ["Reserve paid", `${group(ledger.state?.reserveSats ?? 0)} sats`],
              ["Records", String(ledger.state?.length ?? 0)],
              ["Epoch allowance", atoms(epochAllowance, launch.schedule.decimals, 4)],
            ]}
          />
          <div className="rule" />
          <Notice tone="cyan">
            These figures come from replaying every record this wallet signed and
            checking each one. They are <b>not settled on Bitcoin or CKB</b> —
            the <a href={`#/launch/${launch.id}/proof`}>Proof Explorer</a> states
            what each claim does and does not establish.
          </Notice>
          {ledger.error && <Notice tone="warn">{ledger.error}</Notice>}
        </Panel>
      </section>

      <section className="split">
        <MinePanel
          mining={mining}
          challenge={challenge}
          fields={fields}
          blocked={blockedReason(identity, ticket !== null, epochBlockHash)}
        />
        <ClaimPanel
          launch={launch}
          rules={rules}
          ledger={ledger}
          ticketing={ticketing}
          epochBlockHash={epochBlockHash}
          candidate={mining.sample.best}
          onClaimed={mining.stop}
        />
      </section>

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

/** Why mining is unavailable, in the order a visitor has to resolve them. */
function blockedReason(
  identity: string | null,
  hasTicket: boolean,
  epochBlockHash: string | null,
): string | null {
  if (!identity) return "Connect a wallet — the challenge commits to your identity.";
  if (!epochBlockHash) return "Waiting for the hash of the block that opened this epoch.";
  if (!hasTicket) return "Buy a ticket. The challenge commits to its txid, so work done without one counts for nothing.";
  return null;
}
