/**
 * AGW Mainnet defaults (standalone SDK; no rust-api-client runtime dependency).
 * Chain spec ships as gzip under `assets/`; default claim credential is embedded in `src/embed/`.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MAINNET_DEFAULT_CLAIM_CREDENTIAL_B64 } from "./embed/preset-mainnet.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @internal */
const CHAIN_SPEC_GZ_PATH = join(__dirname, "../assets/agw-chain-spec-v1.bin.gz");

/** @type {string|null} */
let _cachedChainSpecJson = null;

/** Default smoldot bootnode (multiaddr). */
export const AGW_MAINNET_BOOTNODES = [
  "/ip4/150.158.44.248/tcp/30333/p2p/12D3KooWBf4Rh6uVmvbn36sBuejTcPRhRs3dzjWpj4uXX3pTL2nJ"
];

/** Public HTTP base URL of the faucet server (no trailing path); append `/claim`. */
export const AGW_MAINNET_FAUCET_BASE_URL = "http://150.158.44.248:8787";

/** @type {string|null} */
let _cachedFaucetApiKey = null;

/**
 * Default mainnet faucet credential: embedded base64 in `src/embed/preset-mainnet.js`, or override
 * with `process.env.AGW_MAINNET_FAUCET_API_KEY` when set (non-empty).
 */
export function loadMainnetFaucetApiKeySync() {
  if (_cachedFaucetApiKey !== null) return _cachedFaucetApiKey;
  if (typeof process !== "undefined" && process.env) {
    const fromEnv = String(process.env.AGW_MAINNET_FAUCET_API_KEY ?? "").trim();
    if (fromEnv) {
      _cachedFaucetApiKey = fromEnv;
      return _cachedFaucetApiKey;
    }
  }
  try {
    _cachedFaucetApiKey = Buffer.from(MAINNET_DEFAULT_CLAIM_CREDENTIAL_B64, "base64").toString("utf8").trim();
  } catch {
    _cachedFaucetApiKey = "";
  }
  return _cachedFaucetApiKey;
}

/** Resolved once at module load (Node). Same rules as `loadMainnetFaucetApiKeySync`. */
export const AGW_MAINNET_FAUCET_API_KEY = loadMainnetFaucetApiKeySync();

/**
 * Fallback URL when the npm package `assets/` file is unavailable (e.g. custom bundles).
 * Requires network access at runtime.
 */
export const AGW_MAINNET_CHAIN_SPEC_FETCH_URL =
  "https://raw.githubusercontent.com/claw-world-box/nodejs-sdk/main/assets/agw-chain-spec-v1.bin.gz";

/**
 * Synchronously load embedded mainnet raw chain spec JSON (Node.js only).
 * @returns {string}
 */
export function loadMainnetChainSpecJsonSync() {
  if (_cachedChainSpecJson) return _cachedChainSpecJson;
  const gz = readFileSync(CHAIN_SPEC_GZ_PATH);
  _cachedChainSpecJson = gunzipSync(gz).toString("utf8");
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
  const ab = await res.arrayBuffer();
  _cachedChainSpecJson = (await decompressGzipToUtf8(ab)).trim();
  return _cachedChainSpecJson;
}

/**
 * @param {ArrayBuffer} ab
 * @returns {Promise<string>}
 */
async function decompressGzipToUtf8(ab) {
  if (typeof gunzipSync === "function" && typeof Buffer !== "undefined") {
    return gunzipSync(Buffer.from(ab)).toString("utf8");
  }
  if (typeof DecompressionStream !== "undefined") {
    const ds = new DecompressionStream("gzip");
    const stream = new Blob([ab]).stream().pipeThrough(ds);
    return await new Response(stream).text();
  }
  throw new Error("mainnet chain spec: gzip decode requires Node.js or a browser with DecompressionStream");
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
