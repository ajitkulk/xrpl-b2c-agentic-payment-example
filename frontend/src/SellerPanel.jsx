import React from "react";
import { api } from "./api.js";

function amountText(r) {
  if (r.asset === "RLUSD") return `${r.amount} RLUSD`;
  return `${Number(r.amount) / 1_000_000} XRP`;
}

const STATUS = {
  "awaiting-payment": { label: "awaiting payment", cls: "await" },
  paid: { label: "paid", cls: "paid" },
  failed: { label: "failed", cls: "failed" },
};

export default function SellerPanel({ seller, onReset }) {
  async function reset() {
    await api.reset();
    onReset?.();
  }

  return (
    <section className="panel seller">
      <div className="panel-head">
        <h2>🌦️ Seller</h2>
        <span className="sub">Weather API · x402 merchant</span>
      </div>

      {seller && (
        <>
          <div className="wallet-strip">
            <div>
              <div className="k">Seller wallet</div>
              <div className="mono sm">{seller.address}</div>
            </div>
            <div className="bal grow">
              <div className="k">Revenue</div>
              <div className="mono big">{seller.balances.xrp.toFixed(4)} XRP</div>
              {seller.balances.rlusd > 0 && (
                <div className="mono sm">{seller.balances.rlusd} RLUSD</div>
              )}
            </div>
          </div>

          <div className="req-head">
            <span>Inbound requests</span>
            <button className="ghost" onClick={reset}>
              clear log
            </button>
          </div>

          <div className="requests">
            {seller.requests.length === 0 && (
              <div className="empty">No requests yet — ask the agent on the left.</div>
            )}
            {seller.requests.map((r) => {
              const st = STATUS[r.status] || STATUS["awaiting-payment"];
              return (
                <div key={r.id} className={`req ${st.cls}`}>
                  <div className="req-top">
                    <span className="req-city">🔎 {r.city}</span>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="req-meta mono">
                    <span>{amountText(r)}</span>
                    {r.via && (
                      <span title={r.facilitatorReason || ""}>
                        · {r.via === "facilitator" ? "T54 facilitator" : "direct submit"}
                      </span>
                    )}
                    {r.txHash && (
                      <a
                        href={`https://testnet.xrpl.org/transactions/${r.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        · tx {r.txHash.slice(0, 10)}… ↗
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
