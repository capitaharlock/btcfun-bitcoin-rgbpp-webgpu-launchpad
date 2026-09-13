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

import { navigate } from "../App";
import { getTx } from "../lib/bitcoin";
import { txUrl } from "../lib/bitcoin/network";
import { atoms } from "../lib/format";
import { ACTIVE_RGBPP } from "../lib/rgbpp/config";
import { ckbClient } from "../lib/rgbpp/ckb";
import { verifyMint, type MintVerdict } from "../lib/rgbpp/verify";
import { DECIMALS } from "../lib/standard";
import { useTokens } from "../state/TokensProvider";
import { Chip, Field, Notice, Panel } from "../ui/primitives";


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
      <div>
        <div className="eyebrow">proof</div>
        <h1 style={{ fontSize: 30 }}>
          Verify a <span className="grad-text">mint</span>
        </h1>
      </div>

      <Panel eyebrow="input" title="The mint's Bitcoin transaction">
        <div className="row wrapped" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Field label="Bitcoin txid" hint={input && !valid ? "64 lowercase hexadecimal characters." : "From the operations list, or any explorer."}>
              <input className="input mono" spellCheck={false} value={input} onChange={(e) => setInput(e.target.value.trim().toLowerCase())} />
            </Field>
          </div>
          <button className="btn primary" disabled={!valid} onClick={() => navigate(`/proof/${input.trim()}`)}>Verify</button>
        </div>
      </Panel>

      {state.kind === "reading" && <Panel><p className="faint" style={{ margin: 0 }}>Reading both chains…</p></Panel>}
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
              <div key={check.label} className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                <Chip tone={check.ok ? "cyan" : "danger"}>{check.ok ? "✓" : "✗"} {check.label}</Chip>
                <span className="tiny" style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{check.detail}</span>
              </div>
            ))}
          </div>
          {state.verdict.minted !== null && state.verdict.valid && (
            <p style={{ marginBottom: 0 }}>Minted <b>{atoms(state.verdict.minted, DECIMALS, 2)}</b> tokens.</p>
          )}
          <div className="rule" />
          <div className="tiny faint" style={{ overflowWrap: "anywhere" }}>
            Bitcoin <a href={txUrl(txid)} target="_blank" rel="noreferrer">{txid}</a>
            <br />
            CKB <a href={`${ACTIVE_RGBPP.ckbExplorer}${state.ckbTxHash}`} target="_blank" rel="noreferrer">{state.ckbTxHash}</a>
          </div>
        </Panel>
      )}

      <Panel eyebrow="what this checks" title="And what it relies on">
        <p className="tiny">
          The commitment, the ticket, the proof of work and the amount are recomputed here from raw chain data with
          the same functions the mint script's vectors pin. What is relied on: that the Bitcoin provider and the CKB
          node report the chains honestly, and that the Bitcoin transaction is confirmed — the RGB++ lock checked
          that with an SPV proof when CKB accepted it.
        </p>
      </Panel>
    </div>
  );
}
