/* Holdings: what this wallet actually holds, and what it can do with it.
 *
 * Every figure here is replayed from signed records rather than stored, so a
 * balance is a conclusion the page reaches, not a number it was handed. The
 * transfer form produces another signed record; the export produces a file
 * someone else can verify with the same rules.
 *
 * The redemption panel below is a simulation and labelled as one. Redemption is
 * not implemented — it needs the CKB-side reserve from task `V3` — and
 * PROTOCOL.md §2 withdrew the claim that the payout is a price floor.
 */

import { useState } from "react";

import { navigate } from "../App";
import { SPECS, type Launch } from "../data/launches";
import { useLaunches, useLaunchRules } from "../hooks/useLaunches";
import { useLedger, type UseLedger } from "../hooks/useLedger";
import { recordId, signTransfer } from "../lib/ledger";
import { useAnnounce } from "../hooks/useAnnounce";
import { formatRatio, ratioScaled, redeem } from "../lib/reserve";
import { useWallet } from "../state/WalletProvider";
import { atoms, group, parseAmount } from "../lib/format";
import { Chip, KV, Notice, Panel, Stat } from "../ui/primitives";
import { Copyable } from "../ui/Copyable";

export function Holdings() {
  const launches = useLaunches();
  const wallet = useWallet();

  return (
    <div className="stack-lg">
      <div className="row wrapped">
        <div>
          <div className="eyebrow">portfolio</div>
          <h1 style={{ fontSize: 28 }}>Holdings</h1>
        </div>
        <span className="spacer" />
        {wallet.vault ? (
          <Chip tone="cyan" title={wallet.vault.address}>
            {wallet.vault.identity.slice(0, 12)}…
          </Chip>
        ) : (
          <a className="btn" href="#/wallet">Connect a wallet</a>
        )}
      </div>

      {!wallet.vault && (
        <Notice tone="cyan">
          Balances are held against your wallet's public key, so there is
          nothing to show until one is connected.
        </Notice>
      )}

      <div className="grid g2">
        {launches.map((launch) => (
          <Position key={launch.id} launch={launch} />
        ))}
      </div>

      <Notice>
        <b>Redemption is not implemented.</b> The panel inside each position is a
        simulation of <span className="mono">floor(q × R / S)</span> against this
        chain's own reserve. It is not a price floor, promises no recovery of a
        ticket's cost, and runs under an allocation rule that has not been
        adopted (PROTOCOL.md §2, §4.4).
      </Notice>
    </div>
  );
}

function Position({ launch }: { launch: Launch }) {
  const rules = useLaunchRules(launch);
  const ledger = useLedger(rules);
  const wallet = useWallet();
  const [tab, setTab] = useState<"send" | "records" | "backup">("send");

  const identity = wallet.vault?.identity ?? null;
  const held = ledger.balanceOf(identity);
  const state = ledger.state;

  return (
    <Panel>
      <div className="row" style={{ marginBottom: 12 }}>
        <span
          style={{
            width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center",
            background: `color-mix(in oklab, ${launch.accent} 20%, var(--surface-3))`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${launch.accent} 40%, transparent)`,
            fontFamily: "var(--mono)", fontSize: 11, color: launch.accent,
          }}
        >
          {launch.symbol.slice(0, 2)}
        </span>
        <b>{launch.symbol}</b>
        <span className="faint tiny">{launch.name}</span>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => navigate(`/launch/${launch.id}`)}>
          Mine →
        </button>
      </div>

      <div className="statrow">
        <Stat
          k="you hold"
          v={atoms(held, launch.schedule.decimals, 4)}
          unit={launch.symbol}
          tone={held > 0n ? "amber" : undefined}
        />
        <Stat k="chain supply" v={atoms(state?.supply ?? 0n, launch.schedule.decimals, 2)} small />
        <Stat k="reserve" v={group(state?.reserveSats ?? 0)} unit="sats" small />
        <Stat k="records" v={state?.length ?? 0} small />
      </div>

      {ledger.error && <Notice tone="warn">{ledger.error}</Notice>}

      <div className="rule" />

      <div className="segmented" role="group" aria-label={`${launch.symbol} actions`}>
        {(["send", "records", "backup"] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "on" : ""}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {id === "send" ? "Send" : id === "records" ? "Records" : "Backup"}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        {tab === "send" && <SendForm launch={launch} ledger={ledger} held={held} />}
        {tab === "records" && <Records ledger={ledger} launch={launch} />}
        {tab === "backup" && <Backup ledger={ledger} />}
      </div>

      {held > 0n && state && state.supply > 0n && (
        <RedemptionPreview launch={launch} held={held} reserveSats={state.reserveSats} supply={state.supply} />
      )}
    </Panel>
  );
}

function SendForm({ launch, ledger, held }: { launch: Launch; ledger: UseLedger; held: bigint }) {
  const wallet = useWallet();
  const announce = useAnnounce();
  const rules = useLaunchRules(launch);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const scale = 10n ** BigInt(launch.schedule.decimals);
  const parsed = parseAmount(amount, launch.schedule.decimals);
  const valid = parsed !== null && parsed > 0n && parsed <= held && /^0[23][0-9a-f]{64}$/.test(to.trim());

  const send = async () => {
    if (!wallet.vault || parsed === null) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      const record = await signTransfer(wallet.vault, ledger.ledger, rules, {
        to: to.trim(),
        amount: parsed,
        memo: memo.trim() || undefined,
      });
      if (ledger.append(record)) {
        setSent(true);
        void announce({
          kind: "transfer",
          launch: launch.id,
          amount: parsed,
          ref: recordId(record.body),
        });
        setTo("");
        setAmount("");
        setMemo("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  if (!wallet.vault) return <p className="tiny faint">Connect a wallet to send.</p>;
  if (held === 0n) {
    return (
      <p className="tiny faint">
        Nothing to send yet. Mine a claim on the <a href={`#/launch/${launch.id}`}>launch page</a>.
      </p>
    );
  }

  return (
    <div className="stack-sm">
      <div className="field">
        <label htmlFor={`to-${launch.id}`}>recipient public key</label>
        <input
          id={`to-${launch.id}`}
          className="input"
          placeholder="02… or 03… (66 hex characters)"
          spellCheck={false}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <div className="row" style={{ gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`amt-${launch.id}`}>amount</label>
          <input
            id={`amt-${launch.id}`}
            className="input"
            inputMode="decimal"
            placeholder="0.0000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <button
          className="btn"
          style={{ alignSelf: "end" }}
          onClick={() => setAmount((Number(held) / Number(scale)).toString())}
        >
          Max
        </button>
      </div>
      <div className="field">
        <label htmlFor={`memo-${launch.id}`}>memo (optional)</label>
        <input
          id={`memo-${launch.id}`}
          className="input"
          maxLength={120}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>

      <button className="btn primary block" disabled={!valid || sending} onClick={() => void send()}>
        {sending ? "Signing…" : `Send ${launch.symbol}`}
      </button>

      {sent && (
        <Notice tone="cyan">
          Signed and appended. Hand the recipient your exported chain from the
          Backup tab — without shared settlement, a transfer only reaches them
          if the records do.
        </Notice>
      )}
      {error && <Notice tone="warn">{error}</Notice>}
    </div>
  );
}

function Records({ ledger, launch }: { ledger: UseLedger; launch: Launch }) {
  if (ledger.records.length === 0) {
    return <p className="tiny faint">No records on this chain yet.</p>;
  }

  return (
    <div className="hashlog" style={{ maxHeight: 210 }}>
      {[...ledger.records].reverse().map((record) => {
        const body = record.body;
        return (
          <div className="entry" key={`${body.seq}`}>
            <span className="clz">{body.seq}</span>
            <span>{body.kind}</span>
            <span className="spacer" />
            <span>
              {body.kind === "claim"
                ? `+${atoms(BigInt(body.amount), launch.schedule.decimals, 4)} · ${body.clz} bits`
                : `−${atoms(BigInt(body.amount), launch.schedule.decimals, 4)} → ${body.to.slice(0, 10)}…`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Backup({ ledger }: { ledger: UseLedger }) {
  const [json, setJson] = useState("");
  const [shown, setShown] = useState(false);

  return (
    <div className="stack-sm">
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={() => setShown((s) => !s)}>
          {shown ? "Hide export" : "Export this chain"}
        </button>
        <button className="btn ghost" onClick={ledger.clear}>
          Reset chain
        </button>
      </div>
      {shown && <Copyable value={ledger.exportChain()} label="ledger chain" />}

      <div className="field">
        <label htmlFor="import">import a chain</label>
        <textarea
          id="import"
          className="input mono"
          placeholder="paste an exported chain"
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
      </div>
      <button className="btn" disabled={!json.trim()} onClick={() => ledger.importChain(json)}>
        Verify and replace
      </button>
      <Notice>
        Importing replaces this chain rather than merging. Merging two signed
        histories needs a rule for which one wins, and that rule is consensus —
        the thing this layer does not have.
      </Notice>
    </div>
  );
}

function RedemptionPreview({
  launch,
  held,
  reserveSats,
  supply,
}: {
  launch: Launch;
  held: bigint;
  reserveSats: number;
  supply: bigint;
}) {
  const [share, setShare] = useState(25);
  const q = (held * BigInt(share)) / 100n;
  const R = BigInt(reserveSats);
  const { payout, R2, S2 } = redeem(q, R, supply);

  return (
    <>
      <div className="rule" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>redemption simulation — not implemented</div>
      <label className="tiny faint" htmlFor={`redeem-${launch.id}`}>
        redeem {share}% of your position
      </label>
      <input
        id={`redeem-${launch.id}`}
        type="range"
        min={1}
        max={100}
        value={share}
        onChange={(e) => setShare(Number(e.target.value))}
      />
      <KV
        rows={[
          ["Redeeming", atoms(q, launch.schedule.decimals, 4)],
          ["Would pay", `${group(payout)} sats`],
          ["Ratio before", formatRatio(ratioScaled(R, supply))],
          ["Ratio after", formatRatio(ratioScaled(R2, S2))],
        ]}
      />
    </>
  );
}


/** Every launch has a chain, even an empty one, so the grid is stable. */
export const POSITION_COUNT = SPECS.length;
