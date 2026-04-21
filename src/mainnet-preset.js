/**
 * AGW Mainnet defaults (standalone SDK; no rust-api-client runtime dependency).
 * Chain spec file is shipped under `assets/mainnet-chain-spec-raw.json`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {string|null} */
let _cachedChainSpecJson = null;

/** Default smoldot bootnode (multiaddr). */
export const AGW_MAINNET_BOOTNODES = [
  "/ip4/150.158.44.248/tcp/30333/p2p/12D3KooWBf4Rh6uVmvbn36sBuejTcPRhRs3dzjWpj4uXX3pTL2nJ"
];

/** Public HTTP base URL of the faucet server (no trailing path); append `/claim`. */
export const AGW_MAINNET_FAUCET_BASE_URL = "http://150.158.44.248:8787";

/** Must match `FAUCET_CLAIM_API_KEY` on the faucet service. */
export const AGW_MAINNET_FAUCET_API_KEY =
  "6f95a91522cf4b4721f7d717d477ffadf0f218945659a446b5046d5b24e78136";

/**
 * Fallback URL when the npm package `assets/` file is unavailable (e.g. custom bundles).
 * Requires network access at runtime.
 */
export const AGW_MAINNET_CHAIN_SPEC_FETCH_URL =
  "https://raw.githubusercontent.com/claw-world-box/nodejs-sdk/main/assets/mainnet-chain-spec-raw.json";

/**
 * Synchronously load embedded mainnet raw chain spec JSON (Node.js only).
 * @returns {string}
 */
export function loadMainnetChainSpecJsonSync() {
  if (_cachedChainSpecJson) return _cachedChainSpecJson;
  _cachedChainSpecJson = readFileSync(join(__dirname, "../assets/mainnet-chain-spec-raw.json"), "utf8");
  return _cachedChainSpecJson;
}

/**
 * Resolve mainnet chain spec: prefer local `assets/` on Node; otherwise fetch `AGW_MAINNET_CHAIN_SPEC_FETCH_URL`.
 * @returns {Promise<string>}
 */
export async function resolveMainnetChainSpecJson() {
  if (_cachedChainSpecJson) return _cachedChainSpecJson;
  const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);
  if (isNode) {
    try {
      _cachedChainSpecJson = loadMainnetChainSpecJsonSync();
      return _cachedChainSpecJson;
    } catch {
      // fall through to fetch
    }
  }
  const res = await fetch(AGW_MAINNET_CHAIN_SPEC_FETCH_URL);
  if (!res.ok) {
    throw new Error(
      `failed to fetch mainnet chain spec from ${AGW_MAINNET_CHAIN_SPEC_FETCH_URL}: HTTP ${res.status}`
    );
  }
  _cachedChainSpecJson = (await res.text()).trim();
  return _cachedChainSpecJson;
}

/** Preset bundle for advanced callers. */
export const mainnetPreset = Object.freeze({
  name: "mainnet",
  bootnodes: AGW_MAINNET_BOOTNODES,
  faucetBaseUrl: AGW_MAINNET_FAUCET_BASE_URL,
  faucetApiKey: AGW_MAINNET_FAUCET_API_KEY,
  chainSpecFetchUrl: AGW_MAINNET_CHAIN_SPEC_FETCH_URL,
  resolveChainSpecJson: resolveMainnetChainSpecJson,
  loadChainSpecJsonSync: loadMainnetChainSpecJsonSync
});
