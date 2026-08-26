// Client for T54's x402 facilitator on XRPL testnet.
//
// The facilitator verifies a payer-signed XRPL Payment blob and settles it on-ledger.
// It never holds keys — the payer signs, the facilitator only relays and attests.
//
// Note: T54's PUBLIC testnet facilitator enforces the `x402Secure` "verifiable intent"
// extension (a Mastercard-standard SD-JWT credential chain: trustline-issued limit L1,
// owner→agent delegation L2, per-payment commitment L3). Payments without that chain are
// rejected at /verify with `invalid_payload`. Minting that chain needs T54's credential
// issuer, so this demo can't produce one. When the facilitator declines (or is
// unreachable), we settle the SAME payer-signed blob directly on XRPL testnet — the
// identical on-ledger action the facilitator performs at the end of its flow — and the
// seller independently re-verifies the settled transaction on-ledger regardless of path.
import { FACILITATOR_URL, X402_NETWORK } from "./config.js";
import { X402_VERSION } from "./x402.js";
import { submitBlob } from "./xrpl.js";

const TIMEOUT_MS = 8000;

async function post(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${FACILITATOR_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/** GET /supported — advertises the schemes/networks/extensions the facilitator handles. */
export async function getSupported() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${FACILITATOR_URL}/supported`, { signal: controller.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify + settle a payment via the facilitator, falling back to direct on-ledger
 * submission. Returns { via, success, txHash, facilitatorReason?, facilitatorReachable }.
 */
export async function settlePayment({ paymentPayload, paymentRequirements }) {
  const signedTxBlob = paymentPayload?.payload?.signedTxBlob;
  const body = {
    x402Version: X402_VERSION,
    network: X402_NETWORK,
    paymentPayload,
    paymentRequirements,
  };

  try {
    const verify = await post("/verify", body);
    const v = verify.json || {};

    if (v.isValid) {
      const settle = await post("/settle", body);
      const s = settle.json || {};
      const txHash = s.txHash || s.transaction || s.transactionHash || s.hash || null;
      if (settle.ok && (s.success ?? true) && txHash) {
        return { via: "facilitator", success: true, txHash, facilitatorReachable: true };
      }
      // Verified but couldn't settle — fall back to direct submit.
      return directSubmit(signedTxBlob, {
        facilitatorReachable: true,
        facilitatorReason: s.errorReason || `settle status ${settle.status}`,
      });
    }

    // Facilitator reachable but declined the payload (e.g. verifiable-intent required).
    return directSubmit(signedTxBlob, {
      facilitatorReachable: true,
      facilitatorReason: v.invalidReason || "verify declined",
    });
  } catch (err) {
    return directSubmit(signedTxBlob, {
      facilitatorReachable: false,
      facilitatorReason: `unreachable: ${String(err?.message || err)}`,
    });
  }
}

async function directSubmit(signedTxBlob, meta = {}) {
  if (!signedTxBlob) {
    return { via: "direct", success: false, error: "missing signed transaction blob", ...meta };
  }
  const { code, hash } = await submitBlob(signedTxBlob);
  const success = code === "tesSUCCESS";
  return {
    via: "direct",
    success,
    txHash: success ? hash : null,
    code,
    error: success ? undefined : `ledger returned ${code}`,
    ...meta,
  };
}
