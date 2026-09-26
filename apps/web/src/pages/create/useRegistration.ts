/* The register step's one action: pay, certify, announce — and what it costs.
 *
 * Kept apart from the step's markup so the async sequence and its resumption
 * rules read in one place: a registration already paid is never paid again,
 * a certificate already given is not asked for again, and the draft is
 * forgotten only once the announcement is signed.
 */

import { useEffect, useState } from "react";

import { useTip } from "@/app/hooks/useLaunches";
import { InsufficientFunds } from "@/domain/bitcoin";
import { estimateVsize, opReturnScriptBytes, P2WPKH_SCRIPT_BYTES } from "@/domain/bitcoin";
import { fastFeeRate } from "@/adapters/mempool";
import { REGISTRATION_SATS } from "@/domain/launches";
import { certify, payRegistration, type Registration } from "@/app/launches/registration";
import { createLaunch } from "@/app/launches/create";
import type { LaunchCommitment } from "@/domain/launches";
import type { LaunchDraft } from "@/domain/launches";
import { plainFunding } from "@/domain/rgbpp";
import { useLaunchRegistry } from "@/app/providers/LaunchesProvider";
import { landingTxids, useTokens } from "@/app/providers/TokensProvider";
import { useWallet } from "@/app/providers/WalletProvider";
import { forgetDraft } from "./useCreateDraft";

/** The registration's network fee: one plain input, the platform, the commitment, change. */
function registrationFee(feeRate: number): number {
  return Math.ceil(estimateVsize(1, [P2WPKH_SCRIPT_BYTES, opReturnScriptBytes(32), P2WPKH_SCRIPT_BYTES]) * feeRate);
}

/** Where the one registering action stands while it runs. */
export type Phase = "paying" | "certifying" | "announcing";

export interface RegistrationRun {
  certificate: string | null;
  phase: Phase | null;
  error: string | null;
  /** The network fee, once the fee rate is known. */
  fee: number | null;
  /** Registration plus network fee, once the fee rate is known. */
  total: number | null;
  /** Sats the wallet can spend on it, once its balance is read. */
  spendable: number | null;
  /** True when an unpaid registration costs more than the wallet can spend. */
  short: boolean;
  run: () => Promise<void>;
}

export function useRegistration({
  draft,
  registration,
  onPaid,
  onLaunched,
}: {
  draft: LaunchDraft;
  registration: Registration | null;
  onPaid: (paid: Registration) => void;
  onLaunched: (launch: LaunchCommitment) => void;
}): RegistrationRun {
  const wallet = useWallet();
  const tokens = useTokens();
  const registry = useLaunchRegistry();
  const tip = useTip();
  const [certificate, setCertificate] = useState<string | null>(null);
  const [feeRate, setFeeRate] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fastFeeRate().then((rate) => live && setFeeRate(rate));
    return () => {
      live = false;
    };
  }, []);

  const fee = feeRate === null ? null : registrationFee(feeRate);
  const total = fee === null ? null : REGISTRATION_SATS + fee;
  const spendable = wallet.balance
    ? plainFunding(wallet.balance.utxos, landingTxids(tokens.operations)).reduce((n, u) => n + u.value, 0)
    : null;
  const short = !registration && total !== null && spendable !== null && spendable < total;

  const run = async () => {
    const vault = wallet.vault;
    if (!vault || !tip || feeRate === null) return;
    setError(null);
    try {
      let paid = registration;
      if (!paid) {
        setPhase("paying");
        const free = await tokens.service.freeUtxos(vault.address);
        const utxos = plainFunding(free, landingTxids(tokens.operations));
        paid = await payRegistration(vault, draft, tip + draft.opensInBlocks, utxos, feeRate, (hex) => tokens.service.broadcast(hex));
        onPaid(paid);
        void wallet.refresh();
      }
      let cert = certificate;
      if (!cert) {
        setPhase("certifying");
        cert = await certify(draft, paid);
        setCertificate(cert);
      }
      setPhase("announcing");
      const commitment = await createLaunch(vault, draft, paid, cert);
      registry.refresh();
      forgetDraft();
      onLaunched(commitment);
    } catch (err) {
      setError(err instanceof InsufficientFunds ? "Not enough bitcoin for the registration and its network fee." : err instanceof Error ? err.message : String(err));
    } finally {
      setPhase(null);
    }
  };

  return { certificate, phase, error, fee, total, spendable, short, run };
}
