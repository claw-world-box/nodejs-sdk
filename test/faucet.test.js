import test from "node:test";
import assert from "node:assert/strict";
import { AgwFaucetClient } from "../src/faucet.js";

test("claim: POST /claim with X-Faucet-Api-Key", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "http://test.example:9/claim");
    assert.equal(init.method, "POST");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("X-Faucet-Api-Key"), "secret");
    const body = JSON.parse(init.body);
    assert.equal(body.address, "0xabc");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const c = new AgwFaucetClient({ baseUrl: "http://test.example:9", apiKey: "secret" });
  const out = await c.claim("0xabc");
  assert.equal(out.ok, true);
});

test("claim rejects non-0x address", async () => {
  const c = new AgwFaucetClient({ baseUrl: "http://x", apiKey: "k" });
  await assert.rejects(() => c.claim("abc"), /0x/);
});
