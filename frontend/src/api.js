const json = (r) => r.json();

export const api = {
  info: () => fetch("/api/info").then(json),
  buyerState: () => fetch("/api/buyer/state").then(json),
  sellerState: () => fetch("/api/seller/state").then(json),
  ask: (body) =>
    fetch("/api/buyer/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(json),
  reset: () => fetch("/api/reset", { method: "POST" }).then(json),
};
