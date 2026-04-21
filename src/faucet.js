import { AGW_MAINNET_FAUCET_API_KEY, AGW_MAINNET_FAUCET_BASE_URL } from "./mainnet-preset.js";

/**
 * Direct HTTP client to the public faucet `POST {base}/claim` (no local gateway).
 */
export class AgwFaucetClient {
  /**
   * @param {object} [opts]
   * @param {string} [opts.baseUrl]
   * @param {string} [opts.apiKey]
   * @param {typeof fetch} [opts.fetchImpl]
   * @param {number} [opts.timeoutMs]
   */
  constructor({
    baseUrl = AGW_MAINNET_FAUCET_BASE_URL,
    apiKey = AGW_MAINNET_FAUCET_API_KEY,
    fetchImpl = globalThis.fetch.bind(globalThis),
    timeoutMs = 120_000
  } = {}) {
    this.baseUrl = String(baseUrl ?? "").replace(/\/$/, "");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  /**
   * @param {string} address EVM address `0x…`
   * @returns {Promise<Record<string, unknown>>}
   */
  async claim(address) {
    const addr = String(address ?? "").trim();
    if (!addr.startsWith("0x")) {
      throw new Error("AgwFaucetClient.claim: address must be 0x-prefixed");
    }
    if (!this.apiKey) {
      throw new Error(
        "AgwFaucetClient: missing api key — set env AGW_MAINNET_FAUCET_API_KEY or pass { apiKey } to the constructor"
      );
    }
    const url = `${this.baseUrl}/claim`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Faucet-Api-Key": this.apiKey
        },
        body: JSON.stringify({ address: addr }),
        signal: controller.signal
      });
      const text = await res.text();
      /** @type {Record<string, unknown>} */
      let json = {};
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(`faucet: non-JSON response (${res.status}): ${text.slice(0, 240)}`);
        }
      }
      if (!res.ok) {
        const message =
          (typeof json.error === "string" && json.error) ||
          (typeof json.message === "string" && json.message) ||
          `faucet HTTP ${res.status}`;
        const err = new Error(message);
        /** @type {any} */ (err).status = res.status;
        /** @type {any} */ (err).body = json;
        throw err;
      }
      return json;
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * @param {string | { address?: string }} walletLike
   */
  async claimForWallet(walletLike) {
    const addr = typeof walletLike === "string" ? walletLike : walletLike?.address;
    return this.claim(String(addr ?? ""));
  }
}
