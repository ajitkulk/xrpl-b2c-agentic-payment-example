// The Seller: a weather API protected by x402.
//
// GET /weather?city=...&asset=XRP|RLUSD
//   - no payment      -> 402 Payment Required + PAYMENT-REQUIRED header (its XRPL address & price)
//   - with payment    -> verify+settle via the T54 facilitator, re-verify on-ledger,
//                         then return the weather text + PAYMENT-RESPONSE header
import { xrpToDrops } from "xrpl";
import { X402_NETWORK, PRICE, X402_SOURCE_TAG } from "./config.js";
import {
  HEADER_REQUIRED,
  HEADER_SIGNATURE,
  HEADER_RESPONSE,
  X402_VERSION,
  encodeHeader,
  decodeHeader,
  buildPaymentRequirements,
  newInvoiceId,
  invoiceIdHash,
} from "./x402.js";
import { fundOrLoadWallet, getXrpBalance, getTransaction, RLUSD_HEX } from "./xrpl.js";
import { settlePayment } from "./facilitator.js";
import { getState, saveState } from "./state.js";
import { getWeatherText } from "./weather.js";
import { rlusdIssuerAddress, rlusdBalance, ensureRlusdTrustLine } from "./rlusd.js";

let _seller; // XRPL wallet

export async function initSeller() {
  const { sellerSeed } = getState();
  _seller = await fundOrLoadWallet(sellerSeed);
  if (!sellerSeed) saveState({ sellerSeed: _seller.seed });
  // The seller must trust the demo RLUSD issuer to receive RLUSD payments.
  await ensureRlusdTrustLine(_seller).catch(() => {});
  return _seller;
}

export function sellerAddress() {
  if (!_seller) throw new Error("seller not initialized");
  return _seller.address;
}

const XRP_PRICE_DROPS = xrpToDrops(PRICE); // "0.1" XRP -> "100000"

/** The amount + asset fields the seller advertises for a chosen asset. */
function requirementFields(asset) {
  if (asset === "RLUSD") {
    return { asset: RLUSD_HEX, amount: PRICE, issuer: rlusdIssuerAddress(), label: "RLUSD" };
  }
  return { asset: "XRP", amount: XRP_PRICE_DROPS, issuer: undefined, label: "XRP" };
}

function makeRequirements(asset, city, invoiceId) {
  const f = requirementFields(asset);
  return buildPaymentRequirements({
    network: X402_NETWORK,
    asset: f.asset,
    payTo: sellerAddress(),
    amount: f.amount,
    issuer: f.issuer,
    invoiceId,
    sourceTag: X402_SOURCE_TAG,
    description: `Current weather for ${city}`,
    resource: `/weather?city=${encodeURIComponent(city)}`,
    maxTimeoutSeconds: 120,
  });
}

// --- seller request log (rendered by the seller UI) ---------------------
function logRequest(entry) {
  const state = getState();
  const requests = [entry, ...state.sellerRequests].slice(0, 50);
  saveState({ sellerRequests: requests });
}

function updateRequest(invoiceId, patch) {
  const state = getState();
  const requests = state.sellerRequests.map((r) =>
    r.id === invoiceId ? { ...r, ...patch } : r,
  );
  saveState({ sellerRequests: requests });
}

/** Authoritative re-verification: read the settled tx on-ledger and confirm it pays us. */
async function verifyOnLedger(txHash, { invoiceId, asset }) {
  const tx = await getTransaction(txHash);
  const meta = tx.meta || tx.metaData;
  const code = typeof meta === "object" ? meta.TransactionResult : meta;
  const json = tx.tx_json || tx; // xrpl.js returns tx fields at top level or under tx_json
  const okResult = code === "tesSUCCESS";
  const okDest = json.Destination === sellerAddress();
  const okInvoice = (json.InvoiceID || "").toUpperCase() === invoiceIdHash(invoiceId);
  // rippled API v2 reports the delivered amount as DeliverMax (falls back to Amount).
  const amt = json.DeliverMax ?? json.Amount;
  let okAmount = false;
  if (asset === "XRP") {
    okAmount = String(amt) === String(XRP_PRICE_DROPS);
  } else {
    okAmount =
      amt?.currency === RLUSD_HEX &&
      amt?.issuer === rlusdIssuerAddress() &&
      Number(amt?.value) === Number(PRICE);
  }
  return {
    valid: okResult && okDest && okInvoice && okAmount,
    okResult,
    okDest,
    okInvoice,
    okAmount,
    payer: json.Account,
  };
}

export async function weatherHandler(req, res) {
  const city = (req.query.city || "").trim();
  const asset = req.query.asset === "RLUSD" ? "RLUSD" : "XRP";
  if (!city) return res.status(400).json({ error: "missing ?city=" });

  const signatureHeader = req.get(HEADER_SIGNATURE);

  // --- Step 1: no payment yet -> issue an x402 challenge ---
  if (!signatureHeader) {
    const invoiceId = newInvoiceId();
    const requirements = makeRequirements(asset, city, invoiceId);
    logRequest({
      id: invoiceId,
      ts: new Date().toISOString(),
      city,
      asset,
      amount: requirements.amount,
      status: "awaiting-payment",
    });
    res.set(HEADER_REQUIRED, encodeHeader(requirements));
    return res.status(402).json({
      x402Version: X402_VERSION,
      error: "payment required",
      accepts: [requirements],
    });
  }

  // --- Step 2: payment presented -> settle + verify + serve ---
  let payload;
  try {
    payload = decodeHeader(signatureHeader);
  } catch {
    return res.status(400).json({ error: "malformed PAYMENT-SIGNATURE header" });
  }

  const accepted = payload.accepted || {};
  const invoiceId = accepted.extra?.invoiceId;

  // Validate the payment matches what we'd accept.
  const expected = requirementFields(asset);
  const mismatch =
    accepted.payTo !== sellerAddress() ||
    accepted.asset !== expected.asset ||
    String(accepted.amount) !== String(expected.amount);
  if (!invoiceId || mismatch) {
    return res.status(402).json({ error: "payment does not satisfy the requirements" });
  }

  // Verify + settle through the facilitator (falls back to direct on-ledger submit).
  const settlement = await settlePayment({
    paymentPayload: payload,
    paymentRequirements: accepted,
  });

  if (!settlement.success) {
    updateRequest(invoiceId, { status: "failed", detail: settlement.error });
    res.set(HEADER_RESPONSE, encodeHeader({ success: false, ...settlement }));
    return res.status(402).json({ error: "settlement failed", settlement });
  }

  // Authoritative on-ledger re-verification.
  let onLedger;
  try {
    onLedger = await verifyOnLedger(settlement.txHash, { invoiceId, asset });
  } catch (err) {
    onLedger = { valid: false, error: String(err?.message || err) };
  }
  if (!onLedger.valid) {
    updateRequest(invoiceId, { status: "failed", txHash: settlement.txHash });
    return res.status(402).json({ error: "on-ledger verification failed", onLedger });
  }

  // Payment confirmed — deliver the goods.
  let weather;
  try {
    weather = await getWeatherText(city);
  } catch (err) {
    // We were paid but the upstream data source failed; surface it honestly.
    updateRequest(invoiceId, { status: "paid", txHash: settlement.txHash, via: settlement.via });
    return res.status(502).json({ error: `weather source error: ${err.message}`, paid: true });
  }

  updateRequest(invoiceId, {
    status: "paid",
    txHash: settlement.txHash,
    via: settlement.via,
    facilitatorReason: settlement.facilitatorReason,
    buyer: onLedger.payer,
  });

  const paymentResponse = {
    success: true,
    x402Version: X402_VERSION,
    network: X402_NETWORK,
    via: settlement.via,
    txHash: settlement.txHash,
    facilitatorReachable: settlement.facilitatorReachable,
    facilitatorReason: settlement.facilitatorReason,
    payer: onLedger.payer,
  };
  res.set(HEADER_RESPONSE, encodeHeader(paymentResponse));
  return res.status(200).json({
    city,
    weather,
    payment: { txHash: settlement.txHash, via: settlement.via, asset, amount: accepted.amount },
  });
}

export async function getSellerState() {
  const address = sellerAddress();
  const [xrp, rlusd] = await Promise.all([
    getXrpBalance(address),
    rlusdBalance(address).catch(() => 0),
  ]);
  return {
    address,
    price: PRICE,
    balances: { xrp, rlusd },
    requests: getState().sellerRequests,
  };
}
