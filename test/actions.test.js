import test from "node:test";
import assert from "node:assert/strict";
import { submitAction } from "../src/actions.js";
import { encodeMessage, normalizeAction } from "../src/utils.js";

function createClient() {
  const calls = [];
  return {
    calls,
    agentId: 7,
    canUseEvm() {
      return true;
    },
    async callContract(address, abi, method, args) {
      calls.push({ path: "evm", address, method, args });
      return { ok: true, path: "evm", method };
    },
    async move(direction, agentId) {
      calls.push({ path: "substrate", method: "move", args: [direction, agentId] });
      return { ok: true, path: "substrate" };
    },
    async harvest(agentId) {
      calls.push({ path: "substrate", method: "harvest", args: [agentId] });
      return { ok: true, path: "substrate" };
    },
    async broadcast(message, agentId) {
      calls.push({ path: "substrate", method: "broadcast", args: [message, agentId] });
      return { ok: true, path: "substrate" };
    }
  };
}

test("normalizeAction canonicalizes camelCase names", () => {
  assert.equal(normalizeAction("submitHeartbeat"), "submit_heartbeat");
  assert.equal(normalizeAction("buildWall"), "build_wall");
});

test("normalizeAction matches gateway alias table for maintenance and siege", () => {
  assert.equal(normalizeAction("set_maintenance"), "set_structure_maintenance");
  assert.equal(normalizeAction("siegerwall"), "siege_wall");
  assert.equal(normalizeAction("siegewall"), "siege_wall");
});

test("encodeMessage turns strings into bytes", () => {
  assert.deepEqual(Array.from(encodeMessage("hi")), [104, 105]);
});

test("submitAction auto uses evm when available", async () => {
  const client = createClient();
  const out = await submitAction(client, {
    agentId: 1,
    action: "move",
    payload: { direction: "North" },
    path: "auto"
  });
  assert.equal(out.path, "evm");
  assert.equal(client.calls[0].method, "move");
  assert.deepEqual(client.calls[0].args, [1, 0]);
});

test("submitAction substrate path bypasses evm", async () => {
  const client = createClient();
  await submitAction(client, {
    agentId: 2,
    action: "broadcast",
    payload: { message: "hold" },
    path: "substrate"
  });
  assert.equal(client.calls[0].path, "substrate");
  assert.equal(client.calls[0].method, "broadcast");
});

test("submitAction evm transfer uses transfer(..., bytes) once", async () => {
  const client = createClient();
  await submitAction(client, {
    agentId: 3,
    action: "transfer",
    payload: { targetId: 9, amount: 100, memo: "hi" },
    path: "evm"
  });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].method, "transfer");
  assert.deepEqual(client.calls[0].args, [3, 9, 100n, encodeMessage("hi")]);
});

test("submitAction evm transfer without memo passes empty bytes", async () => {
  const client = createClient();
  await submitAction(client, {
    agentId: 4,
    action: "transfer",
    payload: { targetId: 1, amount: 10 },
    path: "evm"
  });
  assert.equal(client.calls[0].method, "transfer");
  assert.deepEqual(client.calls[0].args, [4, 1, 10n, encodeMessage("")]);
});
