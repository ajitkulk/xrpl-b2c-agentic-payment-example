import { Client, Wallet, convertStringToHex, dropsToXrp } from "xrpl";
import { XRPL_WS, RLUSD_ISSUER, RLUSD_CURRENCY } from "./config.js";

let _client;

export async function getClient() {
  if (_client && _client.isConnected()) return _client;
  _client = new Client(XRPL_WS);
  await _client.connect();
  return _client;
}

export async function disconnect() {
  if (_client && _client.isConnected()) await _client.disconnect();
  _client = null;
}

/** Currency codes >3 chars must be sent as a 40-char uppercase hex string. */
export function currencyHex(code) {
  if (code.length <= 3) return code.toUpperCase();
  return convertStringToHex(code).padEnd(40, "0").toUpperCase();
}

export const RLUSD_HEX = currencyHex(RLUSD_CURRENCY);

/** Load a wallet from a saved seed (funding it if the account doesn't exist yet), or mint a fresh funded one. */
export async function fundOrLoadWallet(savedSeed) {
  const client = await getClient();
  if (savedSeed) {
    const wallet = Wallet.fromSeed(savedSeed);
    try {
      await client.request({
        command: "account_info",
        account: wallet.address,
        ledger_index: "validated",
      });
      return wallet;
    } catch (err) {
      if (err?.data?.error !== "actNotFound") throw err;
      const { wallet: funded } = await client.fundWallet(wallet);
      return funded;
    }
  }
  const { wallet } = await client.fundWallet();
  return wallet;
}

/** Current XRP balance (as a number of XRP), or 0 if the account isn't funded. */
export async function getXrpBalance(address) {
  const client = await getClient();
  try {
    const res = await client.request({
      command: "account_info",
      account: address,
      ledger_index: "validated",
    });
    return Number(dropsToXrp(res.result.account_data.Balance));
  } catch (err) {
    if (err?.data?.error === "actNotFound") return 0;
    throw err;
  }
}

/** Balance of a given IOU (defaults to RLUSD) held by `address`. */
export async function getIouBalance(address, currency = RLUSD_HEX, issuer = RLUSD_ISSUER) {
  const client = await getClient();
  try {
    const res = await client.request({
      command: "account_lines",
      account: address,
      ledger_index: "validated",
    });
    const line = res.result.lines.find(
      (l) => l.currency === currency && l.account === issuer,
    );
    return line ? Number(line.balance) : 0;
  } catch (err) {
    if (err?.data?.error === "actNotFound") return 0;
    throw err;
  }
}

/** Ensure `wallet` trusts the RLUSD issuer so it can hold/spend RLUSD. Idempotent. */
export async function ensureRlusdTrustLine(wallet, limit = "1000000") {
  const client = await getClient();
  const res = await client.request({
    command: "account_lines",
    account: wallet.address,
    ledger_index: "validated",
  });
  const has = res.result.lines.some(
    (l) => l.currency === RLUSD_HEX && l.account === RLUSD_ISSUER,
  );
  if (has) return { alreadySet: true };

  const prepared = await client.autofill({
    TransactionType: "TrustSet",
    Account: wallet.address,
    LimitAmount: { currency: RLUSD_HEX, issuer: RLUSD_ISSUER, value: limit },
  });
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  const code = result.result.meta?.TransactionResult;
  if (code !== "tesSUCCESS") throw new Error(`TrustSet failed: ${code}`);
  return { alreadySet: false, result: result.result };
}

/** Submit an already-signed transaction blob and wait for validation. */
export async function submitBlob(txBlob) {
  const client = await getClient();
  const result = await client.submitAndWait(txBlob);
  const meta = result.result.meta;
  const code = typeof meta === "object" ? meta?.TransactionResult : undefined;
  return { code, hash: result.result.hash, result: result.result };
}

/** Look up a validated transaction by hash. */
export async function getTransaction(hash) {
  const client = await getClient();
  const res = await client.request({ command: "tx", transaction: hash });
  return res.result;
}
