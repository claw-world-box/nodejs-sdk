/**
 * Thin HTTP client for **agw-standalone-api** Gateway endpoints that require
 * `x-agw-local-agent: 1` and a loopback TCP peer. Use subpath import:
 * `import { StandaloneGatewayClient } from "agw-game-sdk/standalone-gateway"`.
 *
 * Not re-exported from the main package entry — keeps the default SDK surface
 * focused on WS/smoldot + direct chain access.
 */

const LOCAL_AGENT_HEADER = "x-agw-local-agent";
const LOCAL_AGENT_VALUE = "1";

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl ?? "").replace(/\/$/, "");
}

/**
 * @param {object} opts
 * @param {string} [opts.baseUrl] Default `http://127.0.0.1:8790` (must match your gateway listen address; loopback only for these routes).
 */
export class StandaloneGatewayClient {
  constructor({ baseUrl = "http://127.0.0.1:8790" } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  /**
   * @param {string} path Absolute path starting with /
   * @param {object} body JSON body
   * @returns {Promise<object>}
   */
  async _postJson(path, body) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [LOCAL_AGENT_HEADER]: LOCAL_AGENT_VALUE
      },
      body: JSON.stringify(body ?? {})
    });
    const text = await res.text();
    if (!res.ok) {
      /** @type {unknown} */
      let bodyJson;
      try {
        bodyJson = text ? JSON.parse(text) : undefined;
      } catch {
        bodyJson = undefined;
      }
      const message =
        (bodyJson && typeof bodyJson === "object" && bodyJson !== null && "message" in bodyJson
          ? String(/** @type {{ message?: string }} */ (bodyJson).message)
          : null) ||
        text ||
        `HTTP ${res.status}`;
      const err = new Error(message);
      err.name = "StandaloneGatewayError";
      /** @type {any} */ (err).status = res.status;
      /** @type {any} */ (err).bodyText = text;
      /** @type {any} */ (err).bodyJson = bodyJson;
      throw err;
    }
    if (!text || !text.trim()) {
      return {};
    }
    return JSON.parse(text);
  }

  /** POST /v1/crypto/eth-keygen — empty JSON body. */
  async ethKeygen() {
    return this._postJson("/v1/crypto/eth-keygen", {});
  }

  /**
   * POST /v1/chain/evm/jsonrpc — single JSON-RPC object.
   * On HTTP 200, still inspect `result` / `error` in the returned object.
   * @param {object} rpcBody
   */
  async evmJsonRpc(rpcBody) {
    if (!rpcBody || typeof rpcBody !== "object") {
      throw new TypeError("evmJsonRpc expects a JSON-RPC object");
    }
    if (Array.isArray(rpcBody)) {
      throw new TypeError(
        "evmJsonRpc expects a single JSON-RPC object, not a batch array"
      );
    }
    return this._postJson("/v1/chain/evm/jsonrpc", rpcBody);
  }
}
