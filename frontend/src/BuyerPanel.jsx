import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const ACTOR = {
  agent: { label: "Agent", cls: "agent" },
  wallet: { label: "Wallet skill", cls: "wallet" },
  payment: { label: "Payment skill", cls: "payment" },
  seller: { label: "Seller", cls: "seller" },
};

export default function BuyerPanel({ buyer, onDone }) {
  const [prompt, setPrompt] = useState("What's the weather in Tokyo?");
  const [asset, setAsset] = useState("XRP");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [steps, setSteps] = useState([]);
  const [visible, setVisible] = useState(0);
  const revealRef = useRef(null);

  // Reveal steps one at a time for illustration.
  useEffect(() => {
    clearInterval(revealRef.current);
    if (steps.length === 0) return;
    revealRef.current = setInterval(() => {
      setVisible((v) => {
        if (v >= steps.length) {
          clearInterval(revealRef.current);
          return v;
        }
        return v + 1;
      });
    }, 550);
    return () => clearInterval(revealRef.current);
  }, [steps]);

  async function ask() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setResult(null);
    setSteps([]);
    setVisible(0);
    try {
      const res = await api.ask({ prompt, asset });
      setSteps(res.steps || []);
      setResult(res);
    } catch (err) {
      setSteps([{ n: 1, actor: "agent", title: "Request failed", detail: String(err), status: "error" }]);
    } finally {
      setBusy(false);
      onDone?.();
    }
  }

  const answerReady = result?.ok && visible >= steps.length;

  return (
    <section className="panel buyer">
      <div className="panel-head">
        <h2>🧑‍💻 Buyer</h2>
        <span className="sub">Autonomous agent</span>
      </div>

      {buyer && (
        <div className="wallet-strip">
          <div>
            <div className="k">Agent wallet</div>
            <div className="mono sm">{buyer.address}</div>
          </div>
          <div className="bal">
            <div className="k">Balance</div>
            <div className="mono">{buyer.balances.xrp.toFixed(4)} XRP</div>
            {buyer.balances.rlusd > 0 && <div className="mono sm">{buyer.balances.rlusd} RLUSD</div>}
          </div>
          <div className="policy" title="Wallet-skill auto-sign scope">
            🔒 ≤ {buyer.policy.maxPerTxXrp} XRP/tx
          </div>
        </div>
      )}

      <div className="ask">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask for the weather in a city…"
          disabled={busy}
        />
        <div className="ask-row">
          <div className="asset-toggle">
            {["XRP", "RLUSD"].map((a) => (
              <button
                key={a}
                className={asset === a ? "on" : ""}
                onClick={() => setAsset(a)}
                disabled={busy}
              >
                {a}
              </button>
            ))}
          </div>
          <button className="primary" onClick={ask} disabled={busy}>
            {busy ? "Working…" : "Ask agent"}
          </button>
        </div>
      </div>

      {asset === "RLUSD" && buyer && buyer.balances.rlusd <= 0 && (
        <div className="hint">
          ⚠️ The agent holds no testnet RLUSD (the faucet only funds XRP). Fund{" "}
          <span className="mono">{buyer.address}</span> with test RLUSD via{" "}
          <a href="https://tryrlusd.com" target="_blank" rel="noreferrer">tryrlusd.com</a> or{" "}
          <a href="https://test.bithomp.com/faucet" target="_blank" rel="noreferrer">bithomp</a>, then retry — or just pay in XRP.
        </div>
      )}

      {steps.length > 0 && (
        <div className="timeline">
          {steps.slice(0, visible).map((s) => {
            const a = ACTOR[s.actor] || ACTOR.agent;
            return (
              <div key={s.n} className={`tl-item ${a.cls} ${s.status}`}>
                <div className="tl-dot" />
                <div className="tl-body">
                  <div className="tl-title">
                    <span className={`chip ${a.cls}`}>{a.label}</span>
                    {s.title}
                  </div>
                  {s.detail && <div className="tl-detail mono">{s.detail}</div>}
                </div>
              </div>
            );
          })}
          {visible < steps.length && <div className="tl-working">…</div>}
        </div>
      )}

      {answerReady && (
        <div className="answer">
          <div className="answer-label">Response</div>
          <div className="answer-text">{result.answer}</div>
          {result.payment?.txHash && (
            <a
              className="txlink mono"
              href={`https://testnet.xrpl.org/transactions/${result.payment.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              paid {result.payment.amount === "100000" ? "0.1 XRP" : `${result.payment.amount} ${result.asset}`} ·
              tx {result.payment.txHash.slice(0, 12)}… ↗
            </a>
          )}
        </div>
      )}

      {result && !result.ok && visible >= steps.length && (
        <div className="answer error">
          <div className="answer-label">Failed</div>
          <div className="answer-text">{result.error}</div>
          {result.needsFunding && (
            <div className="answer-links">
              Fund the agent:{" "}
              <a href="https://tryrlusd.com" target="_blank" rel="noreferrer">tryrlusd.com</a>
              {" · "}
              <a href="https://test.bithomp.com/faucet" target="_blank" rel="noreferrer">bithomp faucet</a>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
