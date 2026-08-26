// XRPL AI starter-kit "Wallet Skill" (buyer side).
//
// Owns the agent's key material and signs transactions locally. Crucially it enforces
// an auto-sign scope the human granted the agent:
//   - transaction-type filter: Payment only
//   - network filter: testnet
//   - amount cap: never sign a payment worth more than MAX_SPEND_XRP (1 XRP) per tx
//
// The agent process never sends a payment the wallet skill would refuse to sign.
import { dropsToXrp } from "xrpl";
import { MAX_SPEND_DROPS, MAX_SPEND_XRP } from "./config.js";
import { fundOrLoadWallet, ensureRlusdTrustLine } from "./xrpl.js";
import { getState, saveState } from "./state.js";

let _wallet;

/** Load (or create + fund) the agent wallet, persisting its seed. */
export async function initWallet() {
  const { buyerSeed } = getState();
  _wallet = await fundOrLoadWallet(buyerSeed);
  if (!buyerSeed) saveState({ buyerSeed: _wallet.seed });
  return _wallet;
}

export function getWallet() {
  if (!_wallet) throw new Error("wallet skill not initialized");
  return _wallet;
}

export const spendPolicy = {
  allowedTransactionTypes: ["Payment"],
  network: "testnet",
  maxPerTxXrp: MAX_SPEND_XRP,
};

/** Make sure the agent can hold/spend RLUSD (sets a trust line if needed). */
export async function enableRlusd() {
  return ensureRlusdTrustLine(getWallet());
}

/**
 * Enforce the auto-sign scope against a prepared transaction.
 * Throws (blocking the payment) if it falls outside the granted scope.
 * Returns a human-readable note describing the check that passed.
 */
export function enforceSpendPolicy(tx) {
  if (!spendPolicy.allowedTransactionTypes.includes(tx.TransactionType)) {
    throw new Error(
      `wallet skill refused: ${tx.TransactionType} is outside the auto-sign scope (Payment only)`,
    );
  }

  const amount = tx.Amount;
  if (typeof amount === "string") {
    // XRP, in drops.
    const drops = Number(amount);
    if (drops > MAX_SPEND_DROPS) {
      throw new Error(
        `wallet skill refused: ${dropsToXrp(amount)} XRP exceeds the ${MAX_SPEND_XRP} XRP per-transaction limit`,
      );
    }
    return `checked spend cap: ${dropsToXrp(amount)} XRP ≤ ${MAX_SPEND_XRP} XRP limit ✓`;
  }

  // IOU (e.g. RLUSD): apply the same numeric ceiling to the token value.
  const value = Number(amount.value);
  if (value > MAX_SPEND_XRP) {
    throw new Error(
      `wallet skill refused: ${value} ${amount.currency} exceeds the ${MAX_SPEND_XRP}-per-transaction limit`,
    );
  }
  return `checked spend cap: ${value} RLUSD ≤ ${MAX_SPEND_XRP} limit ✓`;
}

/** Enforce the policy, then sign locally and return the signed tx blob. */
export function signWithinPolicy(preparedTx) {
  const note = enforceSpendPolicy(preparedTx);
  const signed = getWallet().sign(preparedTx);
  return { signedTxBlob: signed.tx_blob, hash: signed.hash, note };
}
