import test from "node:test";
import assert from "node:assert/strict";
import { parseEpoch } from "../src/parsers.js";

test("parseEpoch exposes epochTreasury alias for beaconPool", () => {
  const e = parseEpoch({ index: 3, beaconPool: "9000", beaconTarget: "1", startBlock: 100 });
  assert.equal(e.epochTreasury, "9000");
  assert.equal(e.beaconPool, "9000");
  assert.equal(e.index, 3);
});

test("parseEpoch accepts snake_case storage fields", () => {
  const e = parseEpoch({ current_epoch: 1, beacon_pool: "42", beacon_target: "7", epoch_start_block: 2 });
  assert.equal(e.index, 1);
  assert.equal(e.epochTreasury, "42");
  assert.equal(e.beaconTarget, "7");
  assert.equal(e.startBlock, 2);
});

test("getBeaconEntropy requires evmRpcUrl", async () => {
  const { AgwGameClient } = await import("../src/client.js");
  // `evmRpcUrl: null` would fall back to `wsUrl` in the constructor; use empty string to disable EVM.
  const client = new AgwGameClient({ evmRpcUrl: "" });
  client.api = {};
  await assert.rejects(() => client.getBeaconEntropy(), /evmRpcUrl is required/);
});

test("getBeaconEntropy returns decoded uint256 from callContract", async () => {
  const { AgwGameClient } = await import("../src/client.js");
  const client = new AgwGameClient({ wsUrl: "ws://127.0.0.1:9944", evmRpcUrl: "http://127.0.0.1:9933" });
  client.api = {};
  client.callContract = async () => 12_345n;
  const v = await client.getBeaconEntropy();
  assert.equal(v, 12_345);
});
