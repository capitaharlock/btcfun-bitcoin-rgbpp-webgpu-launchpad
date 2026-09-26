/* The wallet in the top bar: always the same corner, the same icon.
 *
 * With a wallet it is a link to the wallet page, where everything about the
 * wallet lives — address, balance, tokens, activity, switching and logging
 * out — so there is one place to learn and one click to reach it. Without
 * one it opens the chooser in place: connecting should not take a visitor
 * away from the launch they were about to mine.
 */

import { useState } from "react";

import { formatBtc, shortAddress, useWallet } from "@/app/providers/WalletProvider";
import { WalletMark } from "@/ui/PixelIcon";
import { ConnectDialog } from "./Connect";
import "./wallet.css";

export function WalletPill({ active }: { active: boolean }) {
  const { vault, balance } = useWallet();
  const [choosing, setChoosing] = useState(false);

  if (vault) {
    const name = vault.kind === "demo" ? "Demo wallet" : "Wallet";
    return (
      <a
        className="walletpill"
        href="#/wallet"
        aria-current={active ? "page" : undefined}
        title={`${vault.label} · ${vault.address}`}
      >
        <span className="icon">
          <WalletMark />
        </span>
        <span className="who">{name}</span>
        <span className="addr">{shortAddress(vault.address)}</span>
        <span className="bal">{balance ? formatBtc(balance.total) : "…"}</span>
      </a>
    );
  }
  return (
    <>
      <button className="btn walletbutton" onClick={() => setChoosing(true)}>
        <WalletMark />
        Connect wallet
      </button>
      <ConnectDialog open={choosing} onClose={() => setChoosing(false)} />
    </>
  );
}
