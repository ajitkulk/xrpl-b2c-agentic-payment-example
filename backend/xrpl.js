import { Client, Wallet, convertStringToHex, dropsToXrp } from "xrpl";
import { XRPL_WS, RLUSD_CURRENCY } from "./config.js";

// AccountSet flag asfDefaultRipple (8): IOU issuers need it so their tokens ripple.
const ASF_DEFAULT_RIPPLE = 8;

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

/** Balance of a given IOU (issuer required; currency defaults to RLUSD) held by `address`. */
export async function getIouBalance(address, issuer, currency = RLUSD_HEX) {
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

/** Enable DefaultRipple on an IOU issuer so its tokens can ripple between holders. Idempotent. */
export async function enableDefaultRipple(wallet) {
  const info = await getAccountInfo(wallet.address);
  const LSF_DEFAULT_RIPPLE = 0x00800000;
  if (info && (info.Flags & LSF_DEFAULT_RIPPLE) !== 0) return { alreadySet: true };

  const client = await getClient();
  const prepared = await client.autofill({
    TransactionType: "AccountSet",
    Account: wallet.address,
    SetFlag: ASF_DEFAULT_RIPPLE,
  });
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  const code = result.result.meta?.TransactionResult;
  if (code !== "tesSUCCESS") throw new Error(`AccountSet DefaultRipple failed: ${code}`);
  return { alreadySet: false };
}

/** Ensure `wallet` trusts (currency, issuer) so it can hold/spend that IOU. Idempotent. */
export async function ensureTrustLine(wallet, currency, issuer, limit = "1000000") {
  const client = await getClient();
  const res = await client.request({
    command: "account_lines",
    account: wallet.address,
    ledger_index: "validated",
  });
  const has = res.result.lines.some((l) => l.currency === currency && l.account === issuer);
  if (has) return { alreadySet: true };

  const prepared = await client.autofill({
    TransactionType: "TrustSet",
    Account: wallet.address,
    LimitAmount: { currency, issuer, value: limit },
  });
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  const code = result.result.meta?.TransactionResult;
  if (code !== "tesSUCCESS") throw new Error(`TrustSet failed: ${code}`);
  return { alreadySet: false, result: result.result };
}

/** Mint an IOU by sending an issuer Payment to a holder. */
export async function mintIou(issuerWallet, toAddress, currency, value) {
  const client = await getClient();
  const prepared = await client.autofill({
    TransactionType: "Payment",
    Account: issuerWallet.address,
    Destination: toAddress,
    Amount: { currency, issuer: issuerWallet.address, value: String(value) },
  });
  const signed = issuerWallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  const code = result.result.meta?.TransactionResult;
  if (code !== "tesSUCCESS") throw new Error(`Mint ${currency} failed: ${code}`);
  return result.result;
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

/** account_data for an address, or null if the account isn't funded. */
export async function getAccountInfo(address) {
  const client = await getClient();
  try {
    const res = await client.request({
      command: "account_info",
      account: address,
      ledger_index: "validated",
    });
    return res.result.account_data;
  } catch (err) {
    if (err?.data?.error === "actNotFound") return null;
    throw err;
  }
}
