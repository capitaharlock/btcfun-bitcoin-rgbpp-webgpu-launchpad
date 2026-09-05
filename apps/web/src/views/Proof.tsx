/* Proof Explorer.
 *
 * PROTOCOL.md §3 requires that invalid, incomplete and stale evidence stay
 * distinguishable from a valid proof. So this page never shows a single green
 * badge: each claim is paired with what it actually establishes and what it
 * rests on, and the checks that are not implemented say so in the same table as
 * the ones that are.
 *
 * The recomputations are real. The candidate verifier calls the same
 * `recompute` the miner and the ledger use — not a second implementation that
 * could agree with the UI while disagreeing with the rules — and the chain
 * verifier replays every signed record from genesis.
 */

import { useMemo, useState } from "react";

import { navigate } from "../App";
import { PROTOCOL_VERSION, type Launch } from "../data/launches";
import { useEpochBlockHash, useLaunch, useLaunchRules } from "../hooks/useLaunches";
import { useLedger } from "../hooks/useLedger";
import { challengeDigest, type ChallengeFields } from "../lib/challenge";
import { recompute } from "../lib/mining";
import { recordId, type LaunchRules } from "../lib/ledger";
import { bytesToHex } from "../lib/bytes";
import { NETWORK, useWallet } from "../state/WalletProvider";
import { txUrl } from "../lib/bitcoin";
import { atoms, shortHash, splitLeadingZeros } from "../lib/format";
import { Chip, KV, Notice, Panel } from "../ui/primitives";

/** What a check actually establishes, and what it rests on. */
type Strength = "local" | "inclusion" | "assumption" | "missing";

const STRENGTH: Record<Strength, { label: string; tone?: "ok" | "cyan" | "warn" | "danger" }> = {
  local: { label: "locally verified", tone: "ok" },
  inclusion: { label: "needs inclusion proof", tone: "warn" },
  assumption: { label: "trust assumption", tone: "warn" },
  missing: { label: "not implemented", tone: "danger" },
};

interface Check {
  claim: string;
  establishes: string;
  rests_on: string;
  strength: Strength;
}

const PENDING_BLOCK = "0".repeat(64);

export function ProofView({ id }: { id: string }) {
  const launch = useLaunch(id);
  if (!launch) {
    return (
      <Panel title="Launch not found">
        <button className="btn" onClick={() => navigate("/")}>Back</button>
      </Panel>
    );
  }
  return <ProofBody launch={launch} />;
}

function ProofBody({ launch }: { launch: Launch }) {
  const rules = useLaunchRules(launch);
  const wallet = useWallet();
  const epochBlockHash = useEpochBlockHash(launch);
  const [nonce, setNonce] = useState(0n);

  const fields = useMemo<ChallengeFields>(() => {
    return {
      version: PROTOCOL_VERSION,
      network: NETWORK.id,
      launch: launch.id,
      epoch: launch.epoch,
      btcBlockHash: epochBlockHash ?? PENDING_BLOCK,
      ticket: "example-ticket",
      owner: wallet.vault?.identity ?? "unconnected",
    };
  }, [launch, epochBlockHash, wallet.vault?.identity]);

  const verified = useMemo(() => {
    const challenge = challengeDigest(fields);
    return { challenge, candidate: recompute(challenge, nonce) };
  }, [fields, nonce]);

  const checks: Check[] = [
    {
      claim: "Challenge encoding is canonical",
      establishes: "The field set below serialises to exactly this digest, unambiguously.",
      rests_on: "Length-prefixed encoding in challenge.ts. Recomputed in your browser.",
      strength: "local",
    },
    {
      claim: "Candidate hash matches the submitted nonce",
      establishes: "sha256d(challenge ‖ nonce) equals the digest shown, and its clz is as stated.",
      rests_on: "The dependency-free SHA-256 in this page, which also re-checks every GPU result.",
      strength: "local",
    },
    {
      claim: "Records are signed by the identities they name",
      establishes: "Each record's ECDSA signature verifies against its stated author over its digest.",
      rests_on: "secp256k1 verification, replayed here from genesis.",
      strength: "local",
    },
    {
      claim: "No record mints more than the rule allows",
      establishes: "Each claim's amount equals what the §4.3 backing-limited candidate computes.",
      rests_on: "Replay of the whole chain. The rule itself is a candidate, not adopted.",
      strength: "local",
    },
    {
      claim: "The ticket was actually paid",
      establishes: "A transaction with that id exists on the network and carries the launch commitment.",
      rests_on: "mempool.space's word for the transaction. Not an inclusion proof.",
      strength: "inclusion",
    },
    {
      claim: "The epoch used the stated Bitcoin block",
      establishes: "The hash came from the provider for the epoch's opening height.",
      rests_on: "That provider being honest. No SPV proof or accepted-clock policy. Task V8.",
      strength: "assumption",
    },
    {
      claim: "This block is on the canonical chain",
      establishes: "Not established. Fetching from an endpoint is not canonicality.",
      rests_on: "Chain selection, confirmations and data availability. Task V8.",
      strength: "assumption",
    },
    {
      claim: "Ownership is bound to a Bitcoin UTXO",
      establishes: "Nothing yet. Records are signed, but nothing anchors them to a UTXO.",
      rests_on: "RGB++ binding and an authorization proof. Tasks V3, WA6.",
      strength: "missing",
    },
    {
      claim: "This chain is the only chain",
      establishes: "Nothing. Two conflicting signed histories are equally valid to a verifier.",
      rests_on: "Settlement and consensus. The whole point of tasks V1–V3.",
      strength: "missing",
    },
    {
      claim: "The admitted set for this epoch is complete",
      establishes: "Nothing yet. A reproducible queue can still be an incomplete queue.",
      rests_on: "Admission completeness mechanism. Task V9.",
      strength: "missing",
    },
    {
      claim: "Redemption pays what the reserve implies",
      establishes: "Nothing — redemption is simulated, and the reserve is burned satoshis.",
      rests_on: "A CKB-side reserve asset with script enforcement. Task V3.",
      strength: "missing",
    },
  ];

  const { zeros, rest } = splitLeadingZeros(verified.candidate.hash);
  const counts = {
    local: checks.filter((c) => c.strength === "local").length,
    missing: checks.filter((c) => c.strength === "missing").length,
  };

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <button className="btn ghost" onClick={() => navigate(`/launch/${launch.id}`)}>
          ← {launch.symbol}
        </button>
        <span className="spacer" />
        <Chip tone="ok">{counts.local} locally verifiable</Chip>
        <Chip tone="danger">{counts.missing} not implemented</Chip>
      </div>

      <div>
        <div className="eyebrow">proof explorer</div>
        <h1 style={{ fontSize: 28 }}>{launch.symbol} evidence</h1>
      </div>

      <Notice tone="danger">
        <span>
          <b>Most of this proof does not exist yet.</b> Signatures, work and the
          minting rule are checked here in full. Settlement is not: nothing
          anchors these records to Bitcoin or CKB, so this page tells you exactly
          which of the two you are looking at rather than showing one badge.
        </span>
      </Notice>

      <section className="split">
        <Panel eyebrow="recompute in your browser" title="Candidate verification">
          <div className="row wrapped" style={{ gap: 14, marginBottom: 12 }}>
            <label className="tiny faint" htmlFor="nonce">nonce</label>
            <input
              id="nonce"
              className="input"
              style={{ width: 180 }}
              type="number"
              min={0}
              value={Number(nonce)}
              onChange={(e) => setNonce(BigInt(Math.max(0, Math.floor(Number(e.target.value) || 0))))}
            />
            <button className="btn" onClick={() => setNonce((n) => n + 1n)}>step</button>
            <span className="spacer" />
            <Chip tone="cyan">clz {verified.candidate.clz}</Chip>
          </div>

          <div className="eyebrow" style={{ marginBottom: 6 }}>challenge digest</div>
          <div className="hash" style={{ marginBottom: 14 }}>{bytesToHex(verified.challenge)}</div>

          <div className="eyebrow" style={{ marginBottom: 6 }}>sha256d(challenge ‖ nonce)</div>
          <div className="hash">
            <span className="z">{zeros}</span>
            {rest}
          </div>

          <div className="rule" />
          <KV
            rows={[
              ["version", fields.version],
              ["network", fields.network],
              ["launch", fields.launch],
              ["epoch", String(fields.epoch)],
              ["btc block", epochBlockHash ? shortHash(epochBlockHash, 14, 8) : "waiting…"],
              ["ticket", fields.ticket],
              ["owner", shortHash(fields.owner, 12, 6)],
            ]}
          />
        </Panel>

        <ChainVerification
          launchId={launch.id}
          rules={rules}
          decimals={launch.schedule.decimals}
        />
      </section>

      <Panel flush eyebrow="§3" title="What each check establishes">
        <table className="table">
          <thead>
            <tr>
              <th>Claim</th>
              <th>Establishes</th>
              <th>Rests on</th>
              <th className="right">Status</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.claim}>
                <td style={{ color: "var(--ink)" }}>{c.claim}</td>
                <td className="tiny">{c.establishes}</td>
                <td className="tiny faint">{c.rests_on}</td>
                <td className="right">
                  <Chip tone={STRENGTH[c.strength].tone}>{STRENGTH[c.strength].label}</Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

/** Replays this wallet's chain and shows the verdict per record. */
function ChainVerification({
  launchId,
  rules,
  decimals,
}: {
  launchId: string;
  rules: LaunchRules;
  decimals: number;
}) {
  const ledger = useLedger(rules);

  return (
    <Panel
      eyebrow="replay from genesis"
      title="This chain"
      aside={
        ledger.state ? (
          <Chip tone="ok">{ledger.state.length} records verified</Chip>
        ) : (
          <Chip tone="danger">invalid</Chip>
        )
      }
    >
      {ledger.records.length === 0 ? (
        <p className="tiny faint">
          No records yet. Mine a claim on the{" "}
          <a href={`#/launch/${launchId}`}>launch page</a> and it will appear here
          with everything that was checked about it.
        </p>
      ) : (
        <div className="hashlog" style={{ maxHeight: 280 }}>
          {[...ledger.records].reverse().map((record) => (
            <div className="entry" key={record.body.seq}>
              <span className="clz">{record.body.seq}</span>
              <span>{record.body.kind}</span>
              <span className="spacer" />
              {record.body.kind === "claim" && (
                <a href={txUrl(record.body.ticket)} target="_blank" rel="noreferrer">
                  ticket ↗
                </a>
              )}
              <span>{atoms(BigInt(record.body.amount), decimals, 4)}</span>
              <span className="faint">{recordId(record.body).slice(0, 10)}…</span>
            </div>
          ))}
        </div>
      )}

      {ledger.error && <Notice tone="danger">{ledger.error}</Notice>}

      <div className="rule" />
      <p className="tiny faint" style={{ margin: 0 }}>
        Replay checks every signature, every chain link, every nonce against the
        work it claims, every ticket for reuse, and every amount against the
        allocation rule. A single fault rejects the chain rather than returning
        a valid prefix — a balance derived from a partly-valid history is not a
        balance.
      </p>
    </Panel>
  );
}
