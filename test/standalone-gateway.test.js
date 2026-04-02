import test from "node:test";
import assert from "node:assert/strict";
import { StandaloneGatewayClient } from "../src/standalone-gateway.js";

test("ethKeygen: POST url, headers, empty body", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "http://127.0.0.1:8790/v1/crypto/eth-keygen");
    assert.equal(init.method, "POST");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("x-agw-local-agent"), "1");
    assert.equal(headers.get("Content-Type"), "application/json");
    assert.equal(init.body, "{}");
    return new Response(JSON.stringify({ address_hex: "0xabc", private_key_hex: "0x01" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const c = new StandaloneGatewayClient({});
  const out = await c.ethKeygen();
  assert.equal(out.address_hex, "0xabc");
});

test("evmJsonRpc: POST body and returns JSON", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "http://127.0.0.1:9/v1/chain/evm/jsonrpc");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("x-agw-local-agent"), "1");
    const body = JSON.parse(init.body);
    assert.equal(body.method, "eth_chainId");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x539" }), {
      status: 200
    });
  };
  const c = new StandaloneGatewayClient({ baseUrl: "http://127.0.0.1:9" });
  const out = await c.evmJsonRpc({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 });
  assert.equal(out.result, "0x539");
});

test("non-2xx: throws with status and body (403)", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () => new Response("nope", { status: 403 });
  const c = new StandaloneGatewayClient({});
  await assert.rejects(
    () => c.ethKeygen(),
    (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.bodyText, "nope");
      return true;
    }
  );
});

test("non-2xx: 503 with JSON message", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "backend unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  const c = new StandaloneGatewayClient({});
  await assert.rejects(
    () => c.evmJsonRpc({ jsonrpc: "2.0", method: "eth_blockNumber", id: 1 }),
    (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.message, "backend unavailable");
      assert.deepEqual(err.bodyJson, { message: "backend unavailable" });
      return true;
    }
  );
});

test("evmJsonRpc rejects non-object body", async () => {
  const c = new StandaloneGatewayClient({});
  await assert.rejects(() => c.evmJsonRpc(null), TypeError);
});

test("evmJsonRpc rejects JSON-RPC batch array", async () => {
  const c = new StandaloneGatewayClient({});
  await assert.rejects(
    () =>
      c.evmJsonRpc([
        { jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }
      ]),
    (err) => {
      assert.ok(err instanceof TypeError);
      assert.ok(String(err.message).includes("batch"));
      return true;
    }
  );
});
