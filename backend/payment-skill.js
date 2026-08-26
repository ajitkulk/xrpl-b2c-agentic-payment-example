// XRPL AI starter-kit "Payment Skill" (buyer side).
//
// Turns a merchant's x402 PaymentRequirements into a payer-signed XRPL Payment blob:
//   1. build the Payment (XRP drops or an RLUSD IOU amount)
//   2. bind it to the invoice (InvoiceID hash + memo) so it can't be replayed
//   3. autofill against testnet, then ask the Wallet Skill to sign within policy
//
// Signing (and the spend-cap check) is delegated to the Wallet Skill.
import { getClient } from "./xrpl.js";
import { X402_SOURCE_TAG } from "./config.js";
import { buildPaymentPayload, invoiceIdHash, invoiceMemo } from "./x402.js";
import { getWallet, signWithinPolicy } from "./wallet-skill.js";

/** Construct the XRPL Amount for a set of PaymentRequirements. */
function amountFor(requirements) {
  if (requirements.asset === "XRP") return requirements.amount; // drops string
  return {
    currency: requirements.asset,
    issuer: requirements.extra.issuer,
    value: requirements.amount,
  };
}

/**
 * Build, sign (within the wallet policy), and package a payment for the given
 * PaymentRequirements. Returns the PAYMENT-SIGNATURE payload envelope plus notes.
 */
export async function preparePayment(requirements) {
  const client = await getClient();
  const wallet = getWallet();
  const invoiceId = requirements.extra.invoiceId;

  const tx = {
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: requirements.payTo,
    Amount: amountFor(requirements),
    InvoiceID: invoiceIdHash(invoiceId),
    Memos: [invoiceMemo(invoiceId)],
    SourceTag: requirements.extra.sourceTag ?? X402_SOURCE_TAG,
  };

  const prepared = await client.autofill(tx);
  const { signedTxBlob, hash, note } = signWithinPolicy(prepared);
  const payload = buildPaymentPayload(requirements, signedTxBlob);

  return { payload, note, localHash: hash, tx: prepared };
}
