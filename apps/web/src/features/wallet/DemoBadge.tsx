import { useWallet } from "@/app/providers/WalletProvider";
import { Chip } from "@/ui/primitives";

/**
 * Shown wherever the shared demo wallet is the active one. Its key is public,
 * so everything on it can be spent by someone else; nobody should forget which
 * wallet they are looking at.
 */
export function DemoBadge() {
  const { vault } = useWallet();
  if (vault?.kind !== "demo") return null;
  return (
    <Chip tone="warn" title="The shared testnet3 demo wallet. Its key is public: anyone can use it.">
      Demo wallet · shared
    </Chip>
  );
}
