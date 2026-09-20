/* The wallet in the top bar: the way in, and the way out.
 *
 * Always in the same corner with the same icon. Without a wallet it opens the
 * chooser in place — connecting should not take a visitor away from the launch
 * they were about to mine. With one, it opens a short menu: the whole address
 * to copy, the wallet page, and the two ways to leave — switching to another
 * wallet, or logging out. Both go through the same log-out step, which says
 * what leaving costs this kind of wallet before anything is forgotten.
 */

import { useState } from "react";

import { useMenu } from "../../hooks/useMenu";
import type { Vault } from "../../lib/bitcoin";
import { formatBtc, shortAddress, useWallet } from "../../state/WalletProvider";
import { useCopy } from "../../ui/Copyable";
import { WalletMark } from "../../ui/PixelIcon";
import { ConnectDialog } from "./Connect";
import { LogOutDialog } from "./Keys";

export function WalletPill({ active }: { active: boolean }) {
  const { vault } = useWallet();
  const [choosing, setChoosing] = useState(false);

  return (
    <>
      {vault ? (
        <WalletMenu vault={vault} active={active} onSwitched={() => setChoosing(true)} />
      ) : (
        <button className="btn walletbutton" onClick={() => setChoosing(true)}>
          <WalletMark />
          Connect wallet
        </button>
      )}
      <ConnectDialog open={choosing} onClose={() => setChoosing(false)} />
    </>
  );
}

type Leaving = "logout" | "switch" | null;

function WalletMenu({ vault, active, onSwitched }: { vault: Vault; active: boolean; onSwitched: () => void }) {
  const { balance } = useWallet();
  const menu = useMenu();
  const { copied, copy } = useCopy(vault.address);
  const [leaving, setLeaving] = useState<Leaving>(null);
  const name = vault.kind === "demo" ? "Demo wallet" : "Wallet";

  // The focus goes back to the pill first, so a dialog opened from here returns it there.
  const choose = (then: () => void) => () => {
    menu.close(true);
    then();
  };

  return (
    <div className="walletmenu">
      <button
        {...menu.triggerProps}
        className="walletpill"
        aria-current={active ? "page" : undefined}
        title={`${vault.label} · ${vault.address}`}
      >
        <span className="icon">
          <WalletMark />
        </span>
        <span className="who">{name}</span>
        <span className="addr">{shortAddress(vault.address)}</span>
        <span className="bal">{balance ? formatBtc(balance.total) : "…"}</span>
      </button>

      {menu.open && (
        <div className="walletmenu-pop" ref={menu.popRef}>
          <div className="walletmenu-head">
            <span className="eyebrow">{vault.label}</span>
            <code className="mono">{vault.address}</code>
          </div>
          <ul {...menu.menuProps} aria-label={name}>
            <li role="none">
              {/* Copying keeps the menu open, so "Copied" is seen where it was asked for. */}
              <button type="button" role="menuitem" onClick={copy}>
                {copied ? "Copied" : "Copy address"}
              </button>
            </li>
            <li role="none">
              <a role="menuitem" href="#/wallet" onClick={() => menu.close()}>
                Open wallet
              </a>
            </li>
            <li role="none">
              <button type="button" role="menuitem" onClick={choose(() => setLeaving("switch"))}>
                Switch wallet…
              </button>
            </li>
            <li role="none">
              <button type="button" role="menuitem" className="danger" onClick={choose(() => setLeaving("logout"))}>
                Log out
              </button>
            </li>
          </ul>
        </div>
      )}

      <LogOutDialog
        vault={vault}
        open={leaving !== null}
        switching={leaving === "switch"}
        onClose={() => setLeaving(null)}
        onLoggedOut={leaving === "switch" ? onSwitched : undefined}
      />
    </div>
  );
}
