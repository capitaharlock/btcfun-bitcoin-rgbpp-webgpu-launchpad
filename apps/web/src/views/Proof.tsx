import { useMemo, useState } from "react";
import { navigate } from "../App";
import { getLaunch } from "../data/launches";
import { challengeDigest, fakeBlockHash, type ChallengeFields } from "../lib/challenge";
import { sha256d, clz256, wordsToHex, bytesToHex } from "../lib/sha256";
import { Chip, KV, Notice, Panel } from "../ui/primitives";
import { shortHash, splitLeadingZeros } from "../lib/format";

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

export function ProofView({ id }: { id: string }) {
  const launch = getLaunch(id);
  const [nonce, setNonce] = useState(0);

  const fields = useMemo<ChallengeFields | null>(() => {
    if (!launch) return null;
    const epoch = Math.floor(launch.elapsed / launch.epochBlocks);
    return {
      version: "btcfun/0.1-prototype",
      network: "signet",
      launch: launch.id,
      epoch,
      btcBlockHash: fakeBlockHash(launch.h0 + epoch * launch.epochBlocks),
      ticket: "ticket-prototype-0001",
      owner: "tb1q…prototype-recipient",
    };
  }, [launch]);

  const recomputed = useMemo(() => {
    if (!fields) return null;
    const challenge = challengeDigest(fields);
    const buf = new Uint8Array(40);
    buf.set(challenge, 0);
    buf[32] = nonce & 0xff;
    buf[33] = (nonce >>> 8) & 0xff;
    buf[34] = (nonce >>> 16) & 0xff;
    buf[35] = (nonce >>> 24) & 0xff;
    const out = new Uint32Array(8);
    sha256d(buf, out);
    return {
      challengeHex: bytesToHex(challenge),
      digest: wordsToHex(out),
      clz: clz256(out),
    };
  }, [fields, nonce]);

  if (!launch || !fields || !recomputed) {
    return (
      <Panel title="Launch not found">
        <button className="btn" onClick={() => navigate("/")}>Back</button>
      </Panel>
    );
  }

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
      rests_on: "SHA-256 implementation in this page. Recomputed in your browser.",
      strength: "local",
    },
    {
      claim: "The epoch used the stated Bitcoin block",
      establishes: "Nothing yet — the block hash here is a deterministic fixture.",
      rests_on: "A real accepted-clock and SPV policy. Task V8.",
      strength: "missing",
    },
    {
      claim: "This block is on the canonical chain",
      establishes: "Not established. Fetching from an endpoint is not canonicality.",
      rests_on: "Chain selection, confirmations and data availability. Task V8.",
      strength: "assumption",
    },
    {
      claim: "Ownership is bound to a Bitcoin UTXO",
      establishes: "Nothing yet. A UTXO reference is not proof of control (§4.2).",
      rests_on: "RGB++ binding and an authorization proof. Tasks V3, WA6.",
      strength: "missing",
    },
    {
      claim: "The admitted set for this epoch is complete",
      establishes: "Nothing yet. A reproducible queue can still be an incomplete queue.",
      rests_on: "Admission completeness mechanism. Task V9.",
      strength: "missing",
    },
    {
      claim: "Allocation and reserve reconcile",
      establishes: "Nothing yet — no allocation rule is adopted.",
      rests_on: "Tasks E1–E5, then PC-series contract enforcement.",
      strength: "missing",
    },
  ];

  const { zeros, rest } = splitLeadingZeros(recomputed.digest);
  const localCount = checks.filter((c) => c.strength === "local").length;

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <button className="btn ghost" onClick={() => navigate(`/launch/${launch.id}`)}>← {launch.symbol}</button>
        <span className="spacer" />
        <Chip tone="ok">{localCount} locally verifiable</Chip>
        <Chip tone="danger">{checks.filter((c) => c.strength === "missing").length} not implemented</Chip>
      </div>

      <div>
        <div className="eyebrow">proof explorer</div>
        <h1 style={{ fontSize: 28 }}>{launch.symbol} evidence</h1>
      </div>

      <Notice tone="danger">
        <span>
          <b>Most of this proof does not exist yet.</b> PROTOCOL.md §3 requires that
          invalid, incomplete and stale evidence stay distinguishable from a valid
          proof, so this page states what each check actually establishes instead of
          showing a single green badge. Only the two client-side recomputations below
          prove anything today.
        </span>
      </Notice>

      <Panel eyebrow="recompute in your browser" title="Candidate verification">
        <div className="row wrapped" style={{ gap: 14, marginBottom: 12 }}>
          <label className="tiny faint">nonce</label>
          <input
            className="input"
            style={{ width: 160 }}
            type="number"
            min={0}
            value={nonce}
            onChange={(e) => setNonce(Math.max(0, Number(e.target.value)))}
          />
          <button className="btn" onClick={() => setNonce((n) => n + 1)}>step</button>
          <span className="spacer" />
          <Chip tone="cyan">clz {recomputed.clz}</Chip>
        </div>

        <div className="eyebrow" style={{ marginBottom: 6 }}>challenge digest</div>
        <div className="hash" style={{ marginBottom: 14 }}>{recomputed.challengeHex}</div>

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
            ["btc block", shortHash(fields.btcBlockHash, 14, 8)],
            ["ticket", fields.ticket],
            ["owner", fields.owner],
          ]}
        />
      </Panel>

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
