// Tiny JSON-file persistence so wallets/seeds survive server restarts.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const STATE_FILE = join(DATA_DIR, "state.json");

const DEFAULT = {
  buyerSeed: null,
  sellerSeed: null,
  rlusdIssuerSeed: null, // demo self-issued RLUSD issuer
  sellerRequests: [], // audit log the seller UI renders
};

let state = { ...DEFAULT };

export function loadState() {
  if (existsSync(STATE_FILE)) {
    try {
      state = { ...DEFAULT, ...JSON.parse(readFileSync(STATE_FILE, "utf8")) };
    } catch {
      state = { ...DEFAULT };
    }
  }
  return state;
}

export function getState() {
  return state;
}

export function saveState(patch = {}) {
  state = { ...state, ...patch };
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  return state;
}
