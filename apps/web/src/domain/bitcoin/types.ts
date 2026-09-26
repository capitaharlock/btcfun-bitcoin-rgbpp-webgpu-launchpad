/* What the app knows about the Bitcoin chain, independently of who reports it.
 *
 * These shapes are the contract between the rules that build transactions and
 * whichever provider answers for the network: a mempool.space instance today,
 * a node of one's own tomorrow. Nothing here depends on a provider's response
 * format.
 */

export interface Utxo {
  txid: string;
  vout: number;
  /** Value in satoshis. */
  value: number;
  confirmed: boolean;
  /** Height of the confirming block, absent while unconfirmed. */
  height?: number;
}

export interface AddressBalance {
  utxos: Utxo[];
  /** Total spendable, in satoshis. */
  total: number;
  /** Portion of `total` still unconfirmed. */
  pending: number;
}

export interface TxStatus {
  confirmed: boolean;
  height?: number;
  /** Seconds since epoch of the confirming block. */
  time?: number;
}

/** One output of a transaction, as the chain recorded it. */
export interface ChainOutput {
  /** The address it pays, or null for a script with no address form (OP_RETURN). */
  address: string | null;
  /** scriptPubKey, hex. */
  script: string;
  value: number;
}

/** An outpoint a transaction spends. */
export interface ChainInput {
  txid: string;
  vout: number;
}

/** A transaction as the market needs it: what it spent, who was paid what, and whether it stuck. */
export interface ChainTx {
  txid: string;
  confirmed: boolean;
  inputs: ChainInput[];
  outputs: ChainOutput[];
}
