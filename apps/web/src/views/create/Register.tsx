/* Create, step 4: register the launch and announce it, behind one button.
 *
 * The step shows the terms being fixed, the three stages the button runs
 * through (`useRegistration`) and, before anything is signed, whether the
 * wallet can pay for it.
 */

import { useTip } from "../../hooks/useLaunches";
import { group, shortHash } from "../../lib/format";
import { REGISTRATION_SATS } from "../../lib/launches/certificate";
import { extrasOf, type LaunchCommitment, type LaunchDraft, type Registration } from "../../lib/launches/create";
import { NETWORK, useWallet } from "../../state/WalletProvider";
import { BusyButton, KV, More, Notice } from "../../ui/primitives";
import { ExternalLink, TxLink } from "../../ui/TxLink";
import { ProjectLinks } from "../../components/launch/Links";
import { REGISTER } from "./steps";
import { useRegistration, type Phase } from "./useRegistration";
import { Bar, StepHead } from "./WizardChrome";

const PHASE_LABEL: Record<Phase, string> = {
  paying: "Paying the registration…",
  certifying: "Waiting for Bitcoin to see the payment…",
  announcing: "Signing the announcement…",
};

interface RegisterProps {
  draft: LaunchDraft;
  registration: Registration | null;
  onPaid: (paid: Registration) => void;
  onLaunched: (launch: LaunchCommitment) => void;
  back: (() => void) | null;
}

/**
 * Pay, certify and announce behind one button. The payment is the only step
 * that asks anything of the creator; the certificate follows from it (asked
 * for again while Bitcoin's explorers have not seen the payment) and the
 * announcement is a signature with the same key. A registration paid earlier
 * resumes at the certificate and never pays twice.
 */
export function Register({ draft, registration, onPaid, onLaunched, back }: RegisterProps) {
  const wallet = useWallet();
  const tip = useTip();
  const { certificate, phase, error, fee, total, spendable, short, run } = useRegistration({ draft, registration, onPaid, onLaunched });
  const extras = extrasOf(draft);
  const h0 = registration?.h0 ?? (tip ? tip + draft.opensInBlocks : null);

  const stage = !registration ? 1 : certificate ? 3 : 2;
  const action = !wallet.vault ? (
    <a className="btn primary lg" href="#/wallet">Connect a wallet</a>
  ) : phase ? (
    <BusyButton>{PHASE_LABEL[phase]}</BusyButton>
  ) : registration ? (
    <button className="btn primary lg" onClick={() => void run()}>
      {error ? "Try again" : "Finish"} · launch {draft.symbol}, already paid
    </button>
  ) : (
    <button className="btn primary lg" disabled={total === null || short} onClick={() => void run()}>
      {total === null ? "Pricing…" : `Pay ${group(total)} sats & launch ${draft.symbol}`}
    </button>
  );

  return (
    <>
      <div className="cw-body">
        <StepHead eyebrow="step 4 of 5" title="Register it and announce it — one signature" />
        <div className="split">
          <div className="stack-sm">
            <KV
              rows={[
                ["Symbol", draft.symbol],
                ["Name", draft.name],
                ["Ticket income to", shortHash(draft.promoter, 12, 8)],
                ["Opens at block", h0 ? group(h0) : "—"],
                ["Story", extras.story ? `${Object.keys(extras.story).length} of 2 parts` : "none"],
                ["Image", extras.image ? <span className="mono" title={extras.image}>{shortHash(extras.image, 24, 10)}</span> : "none"],
              ]}
            />
            {extras.links && <ProjectLinks links={extras.links} symbol={draft.symbol} small />}
            <More summary="What registering guarantees">
              <p>
                The payment commits to this launch's terms, so it pays for this launch only. btc.fun checks it and signs the
                terms together with the payment's txid; the mint script on CKB refuses tickets for any terms it has not
                signed that way, so {draft.symbol || "your token"} exists only as launched here, and anyone can check the
                certificate and the payment it names. The registration is kept on this device the moment it is sent: a
                reload continues it and never pays twice.
              </p>
              <p>Not refundable. Once paid, nothing above can change: a different field would be a different token.</p>
            </More>
          </div>

          <div className="cr-register">
            <ol className="cr-stages">
              <li className={stage > 1 ? "done" : phase === "paying" ? "on" : ""}>
                <b>1 · Pay the registration</b>
                <span data-paying-from={wallet.vault?.address}>
                  {group(REGISTRATION_SATS)} sats to btc.fun, once{fee !== null ? ` + ${group(fee)} sats network fee` : ""}
                  {wallet.vault ? `, from ${shortHash(wallet.vault.address, 8, 6)}` : ""}.
                </span>
                {registration && (
                  <TxLink kind="btc" id={registration.txid} className="mono">
                    Registration {shortHash(registration.txid, 8, 6)} ↗
                  </TxLink>
                )}
              </li>
              <li className={stage > 2 ? "done" : phase === "certifying" ? "on" : ""}>
                <b>2 · btc.fun certifies it</b>
                <span>
                  {phase === "certifying"
                    ? "Asking every few seconds until Bitcoin has seen the payment. No confirmation needed."
                    : certificate
                      ? "Certified: the mint script will take tickets for this launch."
                      : "Automatic, seconds after the payment."}
                </span>
              </li>
              <li className={phase === "announcing" ? "on" : ""}>
                <b>3 · Announce</b>
                <span>Signed with your key and published, in the same click. Free.</span>
              </li>
            </ol>
            {!wallet.vault && <Notice tone="cyan">Registering pays from a wallet, and announcing signs with its key.</Notice>}
            {short && (
              <Notice tone="warn">
                The wallet has {group(spendable ?? 0)} sats ready; the registration needs {group(total ?? 0)}.{" "}
                {NETWORK.faucets[0] && <ExternalLink href={NETWORK.faucets[0].url}>Get testnet coins ↗</ExternalLink>}
              </Notice>
            )}
            {error && <Notice tone="warn">{error}</Notice>}
          </div>
        </div>
      </div>
      <Bar step={REGISTER} back={back}>
        {action}
      </Bar>
    </>
  );
}
