/* Everything a person can do in the market, written once.
 *
 * The order book, the listings table, the bid list and "my orders" all offer
 * some of the same verbs — buy, list, cancel — and each verb has exactly one
 * implementation here, so a listing signed to meet a bid is the same listing
 * the sell form signs, and completing an accepted bid is the same purchase as
 * buying from the table.
 */

import { useCallback, useMemo } from "react";

import type { Launch } from "../data/launches";
import { payloadRef, record, signActivity } from "../lib/activity";
import { getUtxos, type Vault } from "../lib/bitcoin";
import { bidDraft, cancelDraft, composeBid } from "../lib/market/bid";
import { ACTIVE_RGBPP } from "../lib/rgbpp/config";
import { planTransfer, type TokenCell } from "../lib/rgbpp/operations";
import { completePurchase, planPurchase, signListing } from "../lib/rgbpp/sale";
import { useTokens, type Operation } from "../state/TokensProvider";
import { useWallet } from "../state/WalletProvider";
import { useAnnounce } from "./useAnnounce";
import type { OpenListing, PublishedBid } from "./useMarket";

export interface MarketActions {
  /** Complete a listing: pay the seller and receive the cell, in one transaction. */
  buy(item: OpenListing): Promise<Operation>;
  /** Void a listing by moving its cell back to the seller. */
  cancelListing(item: OpenListing): Promise<Operation>;
  /** Move `amount` out of `from` into a cell of its own, so it can be listed whole. */
  setAside(launch: Launch, from: TokenCell[], amount: bigint): Promise<Operation>;
  /** Sign and publish a listing of `cell` for `priceSats`, optionally answering a bid. */
  list(launch: Launch, cell: TokenCell, priceSats: number, bid?: string): Promise<void>;
  placeBid(launch: Launch, amount: bigint, priceSats: number): Promise<void>;
  cancelBid(bid: PublishedBid): Promise<void>;
}

export function useMarketActions(): MarketActions {
  const { vault } = useWallet();
  const tokens = useTokens();
  const announce = useAnnounce();

  const connected = useCallback((): Vault => {
    if (!vault) throw new Error("Connect a wallet first.");
    return vault;
  }, [vault]);

  const buy = useCallback<MarketActions["buy"]>(
    async ({ listing, launch, cell, offerId }) => {
      const plan = planPurchase(ACTIVE_RGBPP, launch.terms, cell);
      const op = await tokens.submit(
        plan,
        { kind: "buy", launchId: launch.id, tokenId: launch.tokenId, atoms: listing.amount, sats: listing.priceSats },
        { sign: (key, _sealed, free, feeRate) => completePurchase(key, listing, plan, free, feeRate) },
      );
      // Tells the market where to look for the sale; the transaction itself is
      // what it checks, so this report adds no trust of its own.
      await announce({ kind: "fill", launch: launch.id, amount: BigInt(listing.amount), sats: listing.priceSats, ref: offerId, txid: op.btcTxid });
      return op;
    },
    [tokens, announce],
  );

  const setAside = useCallback<MarketActions["setAside"]>(
    async (launch, from, amount) => {
      const plan = planTransfer(ACTIVE_RGBPP, launch.terms, {
        from,
        amount,
        to: connected().address,
        paymaster: await tokens.service.paymaster(),
      });
      return tokens.submit(plan, { kind: "transfer", launchId: launch.id, tokenId: launch.tokenId, atoms: amount.toString() });
    },
    [tokens, connected],
  );

  const cancelListing = useCallback<MarketActions["cancelListing"]>(
    async ({ launch, cell, listing }) => {
      // Moving the cell spends the output the listing signed, which voids it.
      const plan = planTransfer(ACTIVE_RGBPP, launch.terms, {
        from: [cell],
        amount: cell.amount,
        to: connected().address,
        paymaster: await tokens.service.paymaster(),
      });
      return tokens.submit(plan, { kind: "cancel", launchId: launch.id, tokenId: launch.tokenId, atoms: listing.amount });
    },
    [tokens, connected],
  );

  const list = useCallback<MarketActions["list"]>(
    async (launch, cell, priceSats, bid) => {
      const wallet = connected();
      const utxos = await getUtxos(wallet.address);
      const seal = utxos.find((u) => u.txid === cell.seal.txid && u.vout === cell.seal.vout);
      if (!seal) throw new Error("The output this cell is sealed to is not in your wallet yet.");
      const listing = await wallet.use((key) =>
        signListing(key, { launchId: launch.id, tokenId: launch.tokenId, bid }, cell, seal.value, priceSats),
      );
      const meta = JSON.stringify(listing);
      await record(await signActivity(wallet, { kind: "offer", launch: launch.id, amount: cell.amount, sats: priceSats, ref: payloadRef(meta), meta }));
    },
    [connected],
  );

  const placeBid = useCallback<MarketActions["placeBid"]>(
    async (launch, amount, priceSats) => {
      const wallet = connected();
      const bid = composeBid({ launchId: launch.id, tokenId: launch.tokenId, amount, priceSats }, wallet.address);
      await record(await signActivity(wallet, bidDraft(bid)));
    },
    [connected],
  );

  const cancelBid = useCallback<MarketActions["cancelBid"]>(
    async ({ id, launch }) => {
      const wallet = connected();
      await record(await signActivity(wallet, cancelDraft(launch.id, id)));
    },
    [connected],
  );

  return useMemo(
    () => ({ buy, cancelListing, setAside, list, placeBid, cancelBid }),
    [buy, cancelListing, setAside, list, placeBid, cancelBid],
  );
}
