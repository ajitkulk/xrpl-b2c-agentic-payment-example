// Self-issued test RLUSD.
//
// The XRPL testnet faucet only funds XRP, and the OFFICIAL RLUSD testnet faucets are
// gated (GitHub OAuth / CAPTCHA), so for a self-contained demo we run our OWN issuer
// wallet and mint a test token that uses the same "RLUSD" currency code. It is NOT
// Ripple's official RLUSD — just a same-code stand-in the demo fully controls.
import { RLUSD_MINT_AMOUNT } from "./config.js";
import {
  fundOrLoadWallet,
  enableDefaultRipple,
  ensureTrustLine,
  mintIou,
  getIouBalance,
  RLUSD_HEX,
} from "./xrpl.js";
import { getState, saveState } from "./state.js";

let _issuer; // XRPL wallet that issues the demo RLUSD

/** Provision (or reload) the demo RLUSD issuer and turn on DefaultRipple. */
export async function initRlusdIssuer() {
  const { rlusdIssuerSeed } = getState();
  _issuer = await fundOrLoadWallet(rlusdIssuerSeed);
  if (!rlusdIssuerSeed) saveState({ rlusdIssuerSeed: _issuer.seed });
  await enableDefaultRipple(_issuer);
  return _issuer;
}

export function rlusdIssuerAddress() {
  if (!_issuer) throw new Error("RLUSD issuer not initialized");
  return _issuer.address;
}

/** Balance of the demo RLUSD held by `address`. */
export function rlusdBalance(address) {
  return getIouBalance(address, rlusdIssuerAddress(), RLUSD_HEX);
}

/** A holder (buyer or seller) must trust the issuer to hold the token. Idempotent. */
export function ensureRlusdTrustLine(wallet) {
  return ensureTrustLine(wallet, RLUSD_HEX, rlusdIssuerAddress());
}

/**
 * Make sure `wallet` holds at least `min` test RLUSD: set the trust line and mint if
 * the balance is short. Returns { balance, minted }.
 */
export async function ensureRlusdFunded(wallet, min = 1) {
  const balance = await rlusdBalance(wallet.address).catch(() => 0);
  if (balance >= min) return { balance, minted: 0 };
  await ensureRlusdTrustLine(wallet);
  await mintIou(_issuer, wallet.address, RLUSD_HEX, RLUSD_MINT_AMOUNT);
  return { balance: Number(RLUSD_MINT_AMOUNT), minted: Number(RLUSD_MINT_AMOUNT) };
}
