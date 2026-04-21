import test from "node:test";
import assert from "node:assert/strict";
import {
  AGW_MAINNET_BOOTNODES,
  AGW_MAINNET_FAUCET_BASE_URL,
  loadMainnetChainSpecJsonSync,
  resolveMainnetChainSpecJson
} from "../src/mainnet-preset.js";

test("mainnet constants", () => {
  assert.ok(AGW_MAINNET_BOOTNODES[0].includes("/ip4/"));
  assert.ok(AGW_MAINNET_FAUCET_BASE_URL.startsWith("http"));
});

test("embedded chain spec loads and looks like raw JSON", () => {
  const s = loadMainnetChainSpecJsonSync();
  assert.ok(s.length > 1_000_000);
  assert.ok(s.trimStart().startsWith("{"));
});

test("resolveMainnetChainSpecJson returns cached string", async () => {
  const a = await resolveMainnetChainSpecJson();
  const b = await resolveMainnetChainSpecJson();
  assert.equal(a, b);
  assert.ok(a.length > 1_000_000);
});
