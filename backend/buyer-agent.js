// The Buyer Agent: given a natural-language prompt, it fetches the weather from the
// x402-protected seller, paying autonomously with its Wallet + Payment skills.
//
// The whole x402 handshake happens here over real HTTP against the seller; each step is
// recorded so the UI can illustrate what the agent did behind the scenes.
import { SELLER_BASE_URL, FACILITATOR_URL, MAX_SPEND_XRP, PRICE } from "./config.js";
import { HEADER_REQUIRED, HEADER_SIGNATURE, HEADER_RESPONSE, encodeHeader, decodeHeader } from "./x402.js";
import { getWallet, enableRlusd } from "./wallet-skill.js";
import { preparePayment } from "./payment-skill.js";
import { getIouBalance } from "./xrpl.js";

/** Pull a city out of a free-form prompt like "what's the weather in Tokyo?". */
export function parseCity(prompt) {
  if (!prompt) return "";
  const m = prompt.match(/weather\s+(?:in|for|at|of)\s+(.+)/i);
  let city = (m ? m[1] : prompt).trim();
  city = city.replace(/[?.!]+$/g, "").replace(/^["']|["']$/g, "").trim();
  return city;
}

function stepper() {
  const steps = [];
  return {
    steps,
    add(actor, title, detail, status = "done") {
      steps.push({ n: steps.length + 1, actor, title, detail, status, ts: Date.now() });
    },
  };
}

export async function runWeatherRequest({ prompt, city: cityArg, asset = "XRP" }) {
  const { steps, add } = stepper();
  const city = (cityArg || parseCity(prompt)).trim();

  add("agent", "Prompt received", `Parsed city: "${city}" · paying in ${asset}`);

  if (!city) {
    add("agent", "Could not parse a city", "Try e.g. \"weather in Tokyo\"", "error");
    return { ok: false, error: "no city in prompt", steps };
  }

  const wallet = getWallet();
  add(
    "wallet",
    "Wallet skill ready",
    `Agent wallet ${wallet.address} · auto-sign scope: Payment only, ≤ ${MAX_SPEND_XRP} XRP/tx (testnet)`,
  );

  if (asset === "RLUSD") {
    try {
      const t = await enableRlusd();
      add("wallet", "RLUSD trust line", t.alreadySet ? "Already trusts RLUSD issuer" : "Set trust line to RLUSD issuer");
    } catch (err) {
      add("wallet", "RLUSD trust line failed", String(err.message || err), "error");
    }

    // The faucet funds XRP, not RLUSD. Fail fast with a clear, actionable message
    // instead of building a payment that dies on-ledger with tecPATH_DRY.
    const rlusd = await getIouBalance(wallet.address).catch(() => 0);
    if (rlusd < Number(PRICE)) {
      add(
        "wallet",
        "Insufficient RLUSD balance",
        `Agent holds ${rlusd} RLUSD (needs ${PRICE}). Fund ${wallet.address} with testnet RLUSD from a faucet (tryrlusd.com or test.bithomp.com), then retry. XRP works with no funding.`,
        "error",
      );
      return {
        ok: false,
        error: `Agent wallet holds no testnet RLUSD. Fund ${wallet.address} from an RLUSD faucet, then retry (or pay in XRP).`,
        needsFunding: { asset: "RLUSD", address: wallet.address, issuer: undefined },
        steps,
      };
    }
  }

  const url = `${SELLER_BASE_URL}/weather?city=${encodeURIComponent(city)}&asset=${asset}`;

  // --- 1. Unpaid request -> expect a 402 challenge ---
  add("agent", "Requesting weather", `HTTP GET ${url}`);
  let challenge;
  try {
    challenge = await fetch(url);
  } catch (err) {
    add("agent", "Seller unreachable", String(err.message || err), "error");
    return { ok: false, error: "seller unreachable", steps };
  }

  if (challenge.status !== 402) {
    add("agent", `Unexpected ${challenge.status}`, "Expected 402 Payment Required", "error");
    return { ok: false, error: `unexpected status ${challenge.status}`, steps };
  }

  const requirements = decodeHeader(challenge.headers.get(HEADER_REQUIRED));
  const displayAmount =
    requirements.asset === "XRP"
      ? `${Number(requirements.amount) / 1_000_000} XRP`
      : `${requirements.amount} RLUSD`;
  add(
    "seller",
    "402 Payment Required (x402)",
    `Pay ${displayAmount} to ${requirements.payTo} · invoice ${requirements.extra.invoiceId.slice(0, 8)}… · facilitator ${FACILITATOR_URL}`,
  );

  // --- 2. Payment skill builds + Wallet skill signs (within policy) ---
  let prepared;
  try {
    add("payment", "Building payment", `${displayAmount} → seller, bound to invoice (InvoiceID + memo)`);
    prepared = await preparePayment(requirements);
    add("wallet", "Signed within policy", prepared.note);
  } catch (err) {
    add("wallet", "Payment blocked by wallet skill", String(err.message || err), "error");
    return { ok: false, error: String(err.message || err), steps };
  }

  // --- 3. Retry with the signed payload; seller settles via the facilitator ---
  add("agent", "Sending payment", "Retrying request with PAYMENT-SIGNATURE header");
  let paid;
  try {
    paid = await fetch(url, {
      headers: { [HEADER_SIGNATURE]: encodeHeader(prepared.payload) },
    });
  } catch (err) {
    add("agent", "Request failed", String(err.message || err), "error");
    return { ok: false, error: String(err.message || err), steps };
  }

  const responseHeader = paid.headers.get(HEADER_RESPONSE);
  const settlement = responseHeader ? decodeHeader(responseHeader) : null;

  if (paid.status !== 200) {
    const body = await paid.json().catch(() => ({}));
    add("seller", "Payment not accepted", body.error || `status ${paid.status}`, "error");
    return { ok: false, error: body.error || `status ${paid.status}`, steps, settlement };
  }

  const body = await paid.json();
  if (settlement) {
    if (settlement.via === "facilitator") {
      add("seller", "Settled via T54 facilitator", `x402 facilitator settled the payment · tx ${settlement.txHash}`);
    } else {
      const why = settlement.facilitatorReason
        ? `T54 facilitator declined (${settlement.facilitatorReason})`
        : "T54 facilitator unavailable";
      add(
        "seller",
        "Settled on XRPL (facilitator fallback)",
        `${why} → submitted the payer-signed blob directly · tx ${settlement.txHash}`,
      );
    }
  }
  add("seller", "Weather delivered", body.weather.text);

  return {
    ok: true,
    city,
    asset,
    answer: body.weather.text,
    weather: body.weather,
    payment: body.payment,
    settlement,
    requirements,
    agentAddress: wallet.address,
    steps,
  };
}
