// x402 (v2) helpers for the XRPL "exact" scheme, matching the T54 facilitator.
//
// Headers (base64-encoded JSON):
//   PAYMENT-REQUIRED   server -> client   payment challenge (PaymentRequirements)
//   PAYMENT-SIGNATURE  client -> server   signed PaymentPayload envelope
//   PAYMENT-RESPONSE   server -> client   settlement result
import { createHash, randomUUID } from "node:crypto";
import { convertStringToHex } from "xrpl";

export const X402_VERSION = 2;

export const HEADER_REQUIRED = "payment-required";
export const HEADER_SIGNATURE = "payment-signature";
export const HEADER_RESPONSE = "payment-response";

export function encodeHeader(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

export function decodeHeader(value) {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}

/**
 * Build the PaymentRequirements the seller advertises in the 402 response.
 * For XRP, `amount` is drops; for an IOU it is a decimal string plus `extra.issuer`.
 */
export function buildPaymentRequirements({
  scheme = "exact",
  network,
  asset,
  payTo,
  amount,
  description,
  resource,
  invoiceId,
  sourceTag,
  issuer,
  maxTimeoutSeconds = 120,
}) {
  const extra = { invoiceId, sourceTag };
  if (issuer) extra.issuer = issuer;
  return {
    scheme,
    network,
    asset,
    payTo,
    amount,
    description,
    resource,
    maxTimeoutSeconds,
    extra,
  };
}

/** The signed envelope the buyer returns in PAYMENT-SIGNATURE. */
export function buildPaymentPayload(accepted, signedTxBlob) {
  return {
    x402Version: X402_VERSION,
    accepted,
    payload: { signedTxBlob },
  };
}

export function newInvoiceId() {
  return randomUUID();
}

// --- Invoice binding (anti-replay) --------------------------------------
// The Payment is bound to the invoice two ways so the seller can verify on-ledger:
//   Memo:      MemoData = HEX(UTF-8(invoiceId))
//   InvoiceID: SHA256(invoiceId)

export function invoiceMemo(invoiceId) {
  return {
    Memo: {
      MemoType: convertStringToHex("x402-invoice"),
      MemoData: convertStringToHex(invoiceId),
    },
  };
}

export function invoiceIdHash(invoiceId) {
  return createHash("sha256").update(invoiceId, "utf8").digest("hex").toUpperCase();
}
