import express from "express";
import cors from "cors";
import { HTTP_PORT, FACILITATOR_URL, MAX_SPEND_XRP, PRICE } from "./config.js";
import { loadState, saveState } from "./state.js";
import { initWallet, getWallet } from "./wallet-skill.js";
import { initSeller, sellerAddress, weatherHandler, getSellerState } from "./seller.js";
import { runWeatherRequest } from "./buyer-agent.js";
import { getSupported } from "./facilitator.js";
import { getXrpBalance, getIouBalance, disconnect } from "./xrpl.js";

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
      getIouBalance(wallet.address).catch(() => 0),
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
  const [buyer, seller] = await Promise.all([initWallet(), initSeller()]);
  console.log(`Buyer agent wallet:  ${buyer.address}`);
  console.log(`Seller wallet:       ${seller.address}`);
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
