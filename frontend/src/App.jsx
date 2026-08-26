import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import BuyerPanel from "./BuyerPanel.jsx";
import SellerPanel from "./SellerPanel.jsx";

export default function App() {
  const [info, setInfo] = useState(null);
  const [buyer, setBuyer] = useState(null);
  const [seller, setSeller] = useState(null);
  const pollRef = useRef(null);

  async function refresh() {
    try {
      const [b, s] = await Promise.all([api.buyerState(), api.sellerState()]);
      setBuyer(b);
      setSeller(s);
    } catch {
      /* transient */
    }
  }

  useEffect(() => {
    api.info().then(setInfo).catch(() => {});
    refresh();
    pollRef.current = setInterval(refresh, 3000);
    return () => clearInterval(pollRef.current);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          B2B Agentic Treasury — Weather-as-a-Service
        </div>
        <div className="meta">
          {info && (
            <>
              <span className="tag">{info.network}</span>
              <span className="tag">x402</span>
              <span className={`tag ${info.facilitatorReachable ? "ok" : "warn"}`}>
                T54 facilitator {info.facilitatorReachable ? "online" : "best-effort"}
              </span>
              <span className="tag">{info.price} per lookup</span>
            </>
          )}
        </div>
      </header>

      <main className="columns">
        <BuyerPanel buyer={buyer} onDone={refresh} />
        <SellerPanel seller={seller} onReset={refresh} />
      </main>

      <footer className="footnote">
        Buyer agent uses the XRPL AI starter-kit <b>wallet skill</b> (≤ {info?.maxSpendXrp ?? 1}{" "}
        XRP/tx cap) and <b>payment skill</b>. Payment settles over the <b>x402</b> protocol via
        T54's facilitator on XRPL Testnet. Weather from Open-Meteo.
      </footer>
    </div>
  );
}
