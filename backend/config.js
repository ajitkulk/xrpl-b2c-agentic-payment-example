// Central configuration for the XRPL x402 weather demo (testnet).

export const XRPL_WS = "wss://s.altnet.rippletest.net:51233";

// CAIP-2 network identifier used by x402. xrpl:0 = mainnet, xrpl:1 = testnet, xrpl:2 = devnet.
export const X402_NETWORK = "xrpl:1";

// T54's public x402 facilitator for XRPL testnet (best-effort, no SLA).
export const FACILITATOR_URL =
  process.env.XRPL_FACILITATOR_URL || "https://xrpl-facilitator-testnet.t54.ai";

// RLUSD on XRPL testnet.
export const RLUSD_ISSUER = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";
export const RLUSD_CURRENCY = "RLUSD"; // encoded to 40-char hex where the ledger needs it

// The seller charges this per weather lookup.
export const PRICE = "0.1";

// x402 SourceTag T54 uses to attribute XRPL x402 flows.
export const X402_SOURCE_TAG = 804681468;

// Wallet-skill guardrail: the buyer agent may never sign a payment larger than this.
export const MAX_SPEND_XRP = 1; // 1 XRP == 1,000,000 drops
export const MAX_SPEND_DROPS = 1_000_000;

export const HTTP_PORT = process.env.PORT || 4000;

// The buyer agent reaches the seller over real HTTP so the x402 handshake is genuine.
export const SELLER_BASE_URL =
  process.env.SELLER_BASE_URL || `http://localhost:${HTTP_PORT}`;
