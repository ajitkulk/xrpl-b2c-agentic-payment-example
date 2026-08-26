import express from "express";
import cors from "cors";
import { HTTP_PORT, FACILITATOR_URL, MAX_SPEND_XRP, PRICE } from "./config.js";
import { loadState, saveState } from "./state.js";
import { initWallet, getWallet } from "./wallet-skill.js";
import { initSeller, sellerAddress, weatherHandler, getSellerState } from "./seller.js";
import { runWeatherRequest } from "./buyer-agent.js";
import { getSupported } from "./facilitator.js";
import { getXrpBalance, disconnect } from "./xrpl.js";
import { initRlusdIssuer, rlusdIssuerAddress, rlusdBalance, ensureRlusdFunded } from "./rlusd.js";

const app = express();
app.use(cors());
app.use(express.json());

// --- Seller: the x402-protected weather resource ---
app.get("/weather", weatherHandler);

// --- Buyer agent: run a full weather request (pays over x402) ---
app.post("/api/buyer/ask", async (req, res) => {
  try {
    const { prompt, city, asset } = req.body || {};
    const result = await runWeatherRequest({ prompt, city, asset });
    res.json(result);
  } catch (err) {
    console.error("buyer/ask error:", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// --- Buyer state (wallet + balances + policy) ---
app.get("/api/buyer/state", async (_req, res) => {
  try {
    const wallet = getWallet();
    const [xrp, rlusd] = await Promise.all([
      getXrpBalance(wallet.address),
      rlusdBalance(wallet.address).catch(() => 0),
    ]);
    res.json({
      address: wallet.address,
      balances: { xrp, rlusd },
      policy: { maxPerTxXrp: MAX_SPEND_XRP, transactionTypes: ["Payment"], network: "testnet" },
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// --- Seller state (address + balances + request log) ---
app.get("/api/seller/state", async (_req, res) => {
  try {
    res.json(await getSellerState());
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// --- Demo metadata (facilitator, price, network) ---
app.get("/api/info", async (_req, res) => {
  const supported = await getSupported();
  res.json({
    network: "XRPL Testnet",
    facilitator: FACILITATOR_URL,
    facilitatorReachable: !!supported,
    price: PRICE,
    maxSpendXrp: MAX_SPEND_XRP,
    seller: sellerAddress(),
    buyer: getWallet().address,
    rlusd: { selfIssued: true, issuer: rlusdIssuerAddress() },
  });
});

// --- Reset the seller's request log (keeps wallets) ---
app.post("/api/reset", (_req, res) => {
  saveState({ sellerRequests: [] });
  res.json({ ok: true });
});

async function start() {
  loadState();
  console.log("Connecting to XRPL testnet and provisioning wallets…");
  // Issuer first: the seller's trust line and the buyer's minting both need it.
  const issuer = await initRlusdIssuer();
  const buyer = await initWallet();
  const seller = await initSeller();
  // Self-issue test RLUSD to the agent so the RLUSD path works out of the box.
  const { minted } = await ensureRlusdFunded(buyer, Number(PRICE)).catch((e) => {
    console.warn(`RLUSD provisioning skipped: ${e.message}`);
    return { minted: 0 };
  });
  console.log(`Buyer agent wallet:  ${buyer.address}`);
  console.log(`Seller wallet:       ${seller.address}`);
  console.log(`RLUSD issuer (demo): ${issuer.address}${minted ? ` (minted ${minted} RLUSD to buyer)` : ""}`);
  app.listen(HTTP_PORT, () => {
    console.log(`Backend listening on http://localhost:${HTTP_PORT}`);
    console.log(`x402 facilitator:    ${FACILITATOR_URL}`);
  });
}

process.on("SIGINT", async () => {
  await disconnect();
  process.exit(0);
});

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
