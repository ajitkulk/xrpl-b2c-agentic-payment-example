# Agentic Weather — x402 payments on XRPL

A minimal **B2B agentic treasury** demo: a buyer's AI agent pays a seller's weather API
per request, autonomously, over the **x402** protocol on **XRPL Testnet**, settling through
**T54's x402 facilitator**.

The buyer and seller UIs sit side by side on one page.

## What it shows

- **Buyer** — an autonomous agent built on the **XRPL AI starter kit**:
  - **Wallet skill** — owns the agent's XRPL key, signs locally, and enforces an auto-sign
    scope: *Payment only, ≤ 1 XRP per transaction, testnet*. Any payment over the cap is refused.
  - **Payment skill** — turns a merchant's x402 challenge into a payer-signed XRPL Payment.
  - You type a prompt (`weather in Tokyo`); the agent does the x402 handshake behind the
    scenes and shows every step, then prints the weather as the response.
- **Seller** — a weather API protected by x402. It returns HTTP `402 Payment Required` with
  its XRPL address and price (**0.1 XRP or 0.1 RLUSD**), verifies + settles the payment via the
  facilitator, re-verifies the transaction on-ledger, then returns the weather text
  (from **Open-Meteo**). Its XRPL balance grows with each paid request.

## x402 flow

```
Buyer agent ──GET /weather──▶ Seller
            ◀── 402 + PAYMENT-REQUIRED (payTo, amount, invoiceId, facilitator)
  wallet skill: build Payment, bind invoiceId, check ≤1 XRP cap, sign locally
            ──GET /weather + PAYMENT-SIGNATURE (signed tx blob)──▶ Seller
                          Seller ──verify + settle──▶ T54 facilitator ──▶ XRPL Testnet
            ◀── 200 + weather text + PAYMENT-RESPONSE (tx hash)
```

If T54's facilitator (best-effort, no SLA) is unreachable, the seller submits the same
payer-signed blob directly to XRPL Testnet — identical on-ledger result — and always
re-verifies the settled transaction on-ledger before serving the data.

## Run

Two processes (or use the Claude Code preview `frontend` / `backend` launch configs):

```bash
cd backend && npm install && npm start      # http://localhost:4000
```

```bash
cd frontend && npm install && npm run dev    # http://localhost:5173
```

On first boot the backend provisions and funds a buyer agent wallet and a seller wallet
from the testnet faucet, persisting their seeds to `backend/data/state.json`
(`POST /api/reset` clears the seller's request log).

### Paying in RLUSD

XRP works out of the box. To pay in RLUSD, the agent wallet needs an RLUSD trust line
(set automatically on first RLUSD request) **and** an RLUSD balance — fund it from a testnet
RLUSD faucet (e.g. Bithomp / tryrlusd.com) using the agent address shown in the UI.

## Stack

XRPL Testnet · xrpl.js · x402 (v2 "exact" scheme) · T54 facilitator
(`https://xrpl-facilitator-testnet.t54.ai`) · Express · React + Vite · Open-Meteo.

> Demo only — testnet keys are stored in plaintext for convenience. Not for production.
