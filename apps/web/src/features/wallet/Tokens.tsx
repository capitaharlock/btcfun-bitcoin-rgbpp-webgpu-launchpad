/* The wallet's tokens, and moving them.
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

import type { Launch } from "@/domain/launches";
import { useLaunchByToken } from "@/app/hooks/useLaunches";
import { ACTIVE, matchesNetwork } from "@/domain/bitcoin";
import { atoms, parseAmount, shortHash } from "@/ui/format";
import { ACTIVE_RGBPP } from "@/domain/rgbpp";
import { landingMints, positionsOf, type Position } from "@/domain/rgbpp";
import { planTransfer } from "@/domain/rgbpp";
import type { TokenCell } from "@/domain/rgbpp";
import { DECIMALS } from "@/domain/protocol";
import { useServices } from "@/app/providers/ServicesProvider";
import { useTokens, type Operation } from "@/app/providers/TokensProvider";
import { Field, More, Notice, Panel } from "@/ui/primitives";
import { TokenImage } from "@/ui/TokenImage";
import { TxLink } from "@/ui/TxLink";
import "./tokens.css";

/** The Tokens tab. The hub renders it only with a wallet connected. */
export function WalletTokens() {
  const tokens = useTokens();
  const launchOf = useLaunchByToken();
  const landing = landingMints(tokens.operations);
  // A first mint still landing has no cell yet: list its token all the same.
  const positions = tokens.holdings ? positionsOf(tokens.holdings) : [];
  for (const tokenId of landing.keys()) {
    if (!positions.some((p) => p.tokenId === tokenId)) positions.push({ tokenId, cells: [], total: 0n });
  }

  return (
    <div className="stack-lg">
      {tokens.error && <Notice tone="warn">Could not read your cells: {tokens.error}</Notice>}
      {tokens.holdings === null ? (
        <Panel><p className="faint clamp">Reading the cells sealed to your address…</p></Panel>
      ) : positions.length === 0 ? (
        <Panel>
          <p className="clamp">
            No tokens yet. <a href="#/">Pick a launch</a> and mine — or ask someone to send you some.
          </p>
        </Panel>
      ) : (
        <ul className="tk-grid">
          {positions.map((position) => (
            <HoldingCard
              key={position.tokenId}
              position={position}
              landing={landing.get(position.tokenId) ?? 0n}
              launch={launchOf(position.tokenId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One token, small: its picture, its name, what is held, and what can be done
 * with it. Transfer opens its form in the card; Sell goes to the market. Both
 * stay pale while nothing is settled to move — tokens still landing cannot be
 * spent yet.
 */
function HoldingCard({ position, landing, launch }: { position: Position; landing: bigint; launch: Launch | undefined }) {
  const { tokenId, cells, total } = position;
  const [transferring, setTransferring] = useState(false);
  const symbol = launch?.symbol ?? "tokens";
  const movable = launch !== undefined && total > 0n;
  const why = !launch ? "This app has no announcement for this token; any RGB++ wallet can move it." : total === 0n ? "Nothing settled yet: tokens still landing cannot move." : undefined;

  return (
    <li className={`tk-card${transferring ? " open" : ""}`}>
      <div className="tk-head">
        {launch ? (
          <a href={`#/launch/${launch.id}`} className="tk-id" title={`Open ${launch.name}`}>
            <TokenImage art={launch.art} seed={launch.id} accent={launch.accent} symbol={launch.symbol} size="md" />
            <span className="tk-name">
              <b>{launch.symbol}</b>
              <span>{launch.name}</span>
            </span>
          </a>
        ) : (
          <span className="tk-id">
            <span className="tk-name">
              <b className="mono">{shortHash(tokenId, 8, 6)}</b>
              <span>unknown to this app</span>
            </span>
          </span>
        )}
      </div>
      <div className="tk-amount">
        <span className="tk-v">{atoms(total, DECIMALS, 2)}</span> <span className="tk-u">{symbol}</span>
        {landing > 0n && (
          <span className="tk-landing" title="Minted, in the mempool: added to the balance once one Bitcoin block confirms it">
            +{atoms(landing, DECIMALS, 2)} landing
          </span>
        )}
      </div>
      <div className="tk-actions">
        <button className="btn sm" disabled={!movable} title={why} aria-expanded={transferring} onClick={() => setTransferring((t) => !t)}>
          {transferring ? "Close" : "Transfer"}
        </button>
        {movable ? (
          <a className="btn sm" href="#/market">Sell</a>
        ) : (
          <button className="btn sm" disabled title={why}>Sell</button>
        )}
      </div>
      {transferring && launch && (
        <div className="tk-form">
          <TransferForm launch={launch} cells={cells} total={total} />
        </div>
      )}
    </li>
  );
}

function TransferForm({ launch, cells, total }: { launch: Launch; cells: TokenCell[]; total: bigint }) {
  const tokens = useTokens();
  const { rgbpp } = useServices();
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
        paymaster: await rgbpp.paymaster(),
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
          Sent — <TxLink kind="btc" id={sent.btcTxid}>view the Bitcoin transaction</TxLink>. It
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
