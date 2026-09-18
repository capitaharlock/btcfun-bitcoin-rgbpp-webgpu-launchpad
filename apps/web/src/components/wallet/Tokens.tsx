/* What you hold, and moving it.
 *
 * Balances are the xUDT cells sealed to this wallet's Bitcoin outputs, read
 * from the chain through the RGB++ service on every poll. A token this app
 * has no announcement for is still listed, under its type hash: it is yours
 * whether or not btc.fun knows its name.
 *
 * A transfer is one Bitcoin transaction that pays the recipient a small output
 * and seals their tokens to it. The recipient needs no action and no account:
 * the tokens appear in any RGB++-aware wallet for that address.
 */

import { useMemo, useState } from "react";
import { Address } from "@scure/btc-signer";

import type { Launch } from "../data/launches";
import { useLaunchByToken } from "../hooks/useLaunches";
import { ACTIVE, matchesNetwork, txUrl } from "../lib/bitcoin/network";
import { atoms, group, parseAmount, shortHash } from "../lib/format";
import { ACTIVE_RGBPP } from "../lib/rgbpp/config";
import { planTransfer, type TokenCell } from "../lib/rgbpp/operations";
import { DECIMALS } from "../lib/standard";
import { useTokens, type Operation } from "../state/TokensProvider";
import { useWallet } from "../state/WalletProvider";
import { Chip, Field, More, Notice, PageHead, Panel, Stat } from "../ui/primitives";
import { Sigil } from "../ui/Sigil";

export function Holdings() {
  const wallet = useWallet();
  const tokens = useTokens();
  const launchOf = useLaunchByToken();

  if (!wallet.vault) {
    return (
      <Panel eyebrow="holdings" title="Connect a wallet">
        <p className="clamp">Tokens belong to a Bitcoin address. <a href="#/wallet">Open the wallet</a>.</p>
      </Panel>
    );
  }

  const held = [...(tokens.holdings?.tokens ?? new Map<string, TokenCell[]>()).entries()];

  return (
    <div className="stack-lg">
      <PageHead
        eyebrow="holdings"
        title="Your tokens"
        lede="Read from the chain on every poll. Yours whether or not this app knows their name."
        aside={<Chip tone="cyan"><span className="mono">{shortHash(wallet.vault.address, 10, 6)}</span></Chip>}
      />

      {tokens.error && <Notice tone="warn">Could not read your cells: {tokens.error}</Notice>}
      {tokens.holdings === null ? (
        <Panel><p className="faint clamp">Reading the cells sealed to your address…</p></Panel>
      ) : held.length === 0 ? (
        <Panel>
          <p className="clamp">
            No tokens yet. <a href="#/">Pick a launch</a> and mine — or ask someone to send you some.
          </p>
        </Panel>
      ) : (
        held.map(([tokenId, cells]) => (
          <Position key={tokenId} tokenId={tokenId} cells={cells} launch={launchOf(tokenId)} />
        ))
      )}

      <History operations={tokens.operations} launchOf={launchOf} />
    </div>
  );
}

function Position({ tokenId, cells, launch }: { tokenId: string; cells: TokenCell[]; launch: Launch | undefined }) {
  const total = cells.reduce((n, c) => n + c.amount, 0n);
  const symbol = launch?.symbol ?? "tokens";
  return (
    <Panel
      eyebrow={launch ? launch.name : "unknown to this app"}
      title={
        <span className="row">
          {launch && <Sigil seed={launch.id} accent={launch.accent} size="md" />}
          {launch ? launch.symbol : shortHash(tokenId, 10, 6)}
        </span>
      }
      aside={launch && <a className="btn ghost sm" href={`#/launch/${launch.id}`}>Open launch</a>}
    >
      <div className="split">
        <div className="stack-md">
          <div className="scoreboard">
            <Stat k="balance" v={atoms(total, DECIMALS, 2)} unit={symbol} tone="amber" />
            <Stat k="cells" v={group(cells.length)} small />
          </div>
          <More>
            <p>
              Token id <span className="mono">{shortHash(tokenId, 12, 8)}</span>. Each cell is sealed to one of your Bitcoin
              outputs; spending that output without moving the cell would lose it, which is why this app never uses those
              outputs to pay fees.
            </p>
          </More>
        </div>
        {launch ? (
          <TransferForm launch={launch} cells={cells} total={total} />
        ) : (
          <Notice>
            This app has no announcement for this token, so it will not build a transfer for it. It is still
            yours, and any RGB++ wallet can move it.
          </Notice>
        )}
      </div>
    </Panel>
  );
}

function TransferForm({ launch, cells, total }: { launch: Launch; cells: TokenCell[]; total: bigint }) {
  const tokens = useTokens();
  const [to, setTo] = useState("");
  const [amountText, setAmountText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Operation | null>(null);

  const amount = useMemo(() => parseAmount(amountText, DECIMALS), [amountText]);
  const toFault = to && !validAddress(to) ? `A ${ACTIVE.label} address, starting with ${ACTIVE.addressPrefix}.` : null;
  const amountFault =
    amountText && (amount === null || amount <= 0n)
      ? "A positive amount, up to 8 decimals."
      : amount !== null && amount > total
        ? "More than you hold."
        : null;
  const ready = validAddress(to) && amount !== null && amount > 0n && amount <= total;

  const send = async () => {
    if (!ready || amount === null) return;
    setBusy(true);
    setError(null);
    try {
      const plan = planTransfer(ACTIVE_RGBPP, launch.terms, {
        from: cells,
        amount,
        to,
        paymaster: await tokens.service.paymaster(),
      });
      setSent(
        await tokens.submit(plan, {
          kind: "transfer",
          launchId: launch.id,
          tokenId: launch.tokenId,
          atoms: amount.toString(),
        }),
      );
      setAmountText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-sm">
      <Field label="Send to" hint={toFault ?? "Any Bitcoin address."}>
        <input className="input mono" spellCheck={false} placeholder={`${ACTIVE.addressPrefix}…`} value={to} onChange={(e) => setTo(e.target.value.trim())} />
      </Field>
      <Field label={`Amount (${launch.symbol})`} hint={amountFault ?? `You hold ${atoms(total, DECIMALS, 8)}.`}>
        <input className="input" inputMode="decimal" placeholder="0.0" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
      </Field>
      <button className="btn primary" disabled={!ready || busy} onClick={() => void send()}>
        {busy ? "Signing…" : "Send"}
      </button>
      <More>
        <p>
          The tokens are sealed to a small output that pays the recipient. A transfer that leaves you change needs a second
          cell, whose capacity the RGB++ paymaster provides for a fee in the same transaction.
        </p>
      </More>
      {error && <Notice tone="danger">{error}</Notice>}
      {sent && (
        <Notice tone="cyan">
          Sent — <a href={txUrl(sent.btcTxid)} target="_blank" rel="noopener noreferrer">view the Bitcoin transaction</a>. It
          settles on CKB after it confirms.
        </Notice>
      )}
    </div>
  );
}

function validAddress(address: string): boolean {
  if (!matchesNetwork(address, ACTIVE)) return false;
  try {
    Address(ACTIVE.params).decode(address);
    return true;
  } catch {
    return false;
  }
}

function History({ operations, launchOf }: { operations: Operation[]; launchOf: (tokenId: string) => Launch | undefined }) {
  if (operations.length === 0) return null;
  const tone = { sent: "cyan", queued: "cyan", settled: "ok", failed: "danger" } as const;
  return (
    <Panel eyebrow="this wallet" title="Operations">
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>what</th>
              <th>token</th>
              <th>amount</th>
              <th>stage</th>
              <th>bitcoin</th>
              <th>ckb</th>
            </tr>
          </thead>
          <tbody>
            {operations.map((op) => {
              const launch = launchOf(op.tokenId);
              return (
                <tr key={op.btcTxid}>
                  <td>{op.kind}</td>
                  <td>{launch?.symbol ?? shortHash(op.tokenId, 8, 4)}</td>
                  <td className="mono">
                    {op.atoms ? atoms(BigInt(op.atoms), DECIMALS, 2) : op.sats ? `${group(op.sats)} sats` : "—"}
                  </td>
                  <td><Chip tone={tone[op.stage]} live={op.stage === "sent" || op.stage === "queued"}>{op.stage}</Chip></td>
                  <td><a href={txUrl(op.btcTxid)} target="_blank" rel="noopener noreferrer" className="mono">{op.btcTxid.slice(0, 10)}…</a></td>
                  <td>
                    {op.ckbTxHash ? (
                      <a href={`${ACTIVE_RGBPP.ckbExplorer}${op.ckbTxHash}`} target="_blank" rel="noopener noreferrer" className="mono">
                        {op.ckbTxHash.slice(0, 12)}…
                      </a>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
