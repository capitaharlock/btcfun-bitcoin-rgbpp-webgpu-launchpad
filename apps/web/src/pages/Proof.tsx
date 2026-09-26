/* Verify a mint: paste a Bitcoin txid, get every rule re-checked.
 *
 * The page fetches the Bitcoin transaction from the Bitcoin provider, asks the
 * RGB++ service which CKB transaction it settled as, fetches that and the cells
 * it consumed from a CKB node, and hands the raw data to `verifyMint`. The
 * service is only used to find the CKB hash; everything checked comes from the
 * two chains. A reader who trusts neither provider can run the same function
 * against their own nodes.
 */

import { useEffect, useState } from "react";

import { navigate } from "@/app/router";
import { getTx } from "@/adapters/mempool";
import { atoms } from "@/ui/format";
import { ACTIVE_RGBPP } from "@/domain/rgbpp";
import { ckbClient } from "@/adapters/ckb";
import { verifyMint, type MintVerdict } from "@/domain/rgbpp";
import { DECIMALS } from "@/domain/protocol";
import { useTokens } from "@/app/providers/TokensProvider";
import { Chip, Field, More, Notice, PageHead, Panel } from "@/ui/primitives";
import { TxLink } from "@/ui/TxLink";


type State =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "pending"; detail: string }
  | { kind: "done"; verdict: MintVerdict; ckbTxHash: string }
  | { kind: "error"; message: string };

export function ProofView({ txid }: { txid?: string }) {
  const tokens = useTokens();
  const [input, setInput] = useState(txid ?? "");
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (!txid) return;
    let live = true;
    setState({ kind: "reading" });
    (async () => {
      const btc = await getTx(txid);
      const status = await tokens.service.status(txid);
      if (!status.ckbTxHash) {
        return { kind: "pending", detail: `The RGB++ queue has not settled it on CKB yet (${status.state}).` } as State;
      }
      const response = await ckbClient().getTransaction(status.ckbTxHash);
      if (!response) return { kind: "error", message: "The CKB node does not know that transaction." } as State;
      const tx = response.transaction;
      const inputs = await Promise.all(
        tx.inputs.map(async (i) => {
          const cell = await ckbClient().getCell(i.previousOutput);
          if (!cell) throw new Error("A consumed cell could not be fetched from the CKB node.");
          return { output: cell.cellOutput, data: cell.outputData };
        }),
      );
      const verdict = verifyMint(ACTIVE_RGBPP, {
        btcTxid: txid,
        btcOutputs: btc.outputs.map((o) => o.script),
        ckbTx: tx,
        inputs,
      });
      return { kind: "done", verdict, ckbTxHash: status.ckbTxHash } as State;
    })().then(
      (next) => live && setState(next),
      (err: unknown) => live && setState({ kind: "error", message: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      live = false;
    };
  }, [txid, tokens.service]);

  const valid = /^[0-9a-f]{64}$/.test(input.trim());

  return (
    <div className="stack-lg">
      <PageHead
        eyebrow="proof"
        title={
          <>
            Verify a <span className="hl cyan">mint</span>
          </>
        }
        lede="Paste a mint's Bitcoin txid. Every rule is recomputed from the two chains."
      />

      <Panel eyebrow="input" title="The mint's Bitcoin transaction">
        <div className="row wrapped align-end">
          <div className="grow">
            <Field label="Bitcoin txid" hint={input && !valid ? "64 lowercase hexadecimal characters." : "From the operations list, or any explorer."}>
              <input className="input mono" spellCheck={false} value={input} onChange={(e) => setInput(e.target.value.trim().toLowerCase())} />
            </Field>
          </div>
          <button className="btn primary" disabled={!valid} onClick={() => navigate(`/proof/${input.trim()}`)}>Verify</button>
        </div>
      </Panel>

      {state.kind === "reading" && <Panel><p className="faint clamp">Reading both chains…</p></Panel>}
      {state.kind === "pending" && <Notice tone="cyan">{state.detail}</Notice>}
      {state.kind === "error" && <Notice tone="danger">{state.message}</Notice>}
      {state.kind === "done" && txid && (
        <Panel
          eyebrow="verdict"
          title={state.verdict.valid ? "Every rule holds" : "This is not a valid mint"}
          aside={<Chip tone={state.verdict.valid ? "cyan" : "danger"}>{state.verdict.valid ? "valid" : "invalid"}</Chip>}
        >
          <div className="stack-sm">
            {state.verdict.checks.map((check) => (
              <div key={check.label} className="check">
                <Chip tone={check.ok ? "cyan" : "danger"}>{check.ok ? "✓" : "✗"} {check.label}</Chip>
                <span className="tiny">{check.detail}</span>
              </div>
            ))}
          </div>
          {state.verdict.minted !== null && state.verdict.valid && (
            <p className="minted">Minted <b>{atoms(state.verdict.minted, DECIMALS, 2)}</b> tokens.</p>
          )}
          <div className="rule" />
          <div className="tiny faint anywhere">
            Bitcoin <TxLink kind="btc" id={txid}>{txid}</TxLink>
            <br />
            CKB <TxLink kind="ckb" id={state.ckbTxHash}>{state.ckbTxHash}</TxLink>
          </div>
        </Panel>
      )}

      <More boxed summary="What this checks, and what it relies on">
        <p>
          The commitment, the ticket, the proof of work and the amount are recomputed here from raw chain data with the same
          functions the mint script's vectors pin. What is relied on: that the Bitcoin provider and the CKB node report the
          chains honestly, and that the Bitcoin transaction is confirmed — the RGB++ lock checked that with an SPV proof when
          CKB accepted it.
        </p>
      </More>
    </div>
  );
}
