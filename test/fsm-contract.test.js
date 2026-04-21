import test from "node:test";
import assert from "node:assert/strict";
import { WEI_PER_AGW } from "../src/constants.js";
import { readWorld } from "../src/read-world.js";

function baseAgent(overrides = {}) {
  const nativeBalance =
    overrides.nativeBalance !== undefined ? overrides.nativeBalance : 100n * WEI_PER_AGW;
  return {
    id: 1,
    owner: "0x1111111111111111111111111111111111111111",
    position: { x: 5, y: 5 },
    hp: 100,
    hpMax: 100,
    energy: String(nativeBalance / WEI_PER_AGW),
    status: "Active",
    tier: "Normal",
    bornAtBlock: 0,
    lastHeartbeat: 0,
    lastSettledBlock: 0,
    lastEpochSeen: 0,
    sleepUntilBlock: 0,
    epochBadges: 0,
    nativeBalance,
    balanceWei: nativeBalance.toString(),
    ...overrides
  };
}

function minimalClient(overrides = {}) {
  return {
    agentId: 1,
    mapWidth: 256,
    mapHeight: 256,
    canUseEvm: () => overrides.canUseEvm !== false,
    getAgent: overrides.getAgent,
    watchSurroundings: overrides.watchSurroundings,
    getNearbyAgents: overrides.getNearbyAgents,
    getRecentMessages: overrides.getRecentMessages,
    getRuin: overrides.getRuin ?? (async () => null),
    getEpoch: overrides.getEpoch,
    getCurrentBlockNumber: overrides.getCurrentBlockNumber,
    getAllowedActions: overrides.getAllowedActions ?? (() => ["move", "harvest"])
  };
}

test("readWorld exposes fsmState, fsmAllowedActions, fsmConfig aligned with state and allowedActions", async () => {
  const client = minimalClient({
    async getAgent(id) {
      return baseAgent({ id });
    },
    async watchSurroundings() {
      return [{ x: 5, y: 5, terrain: "Plain", occupants: 0 }];
    },
    async getNearbyAgents() {
      return [];
    },
    async getRecentMessages() {
      return [];
    },
    async getEpoch() {
      return { index: 0, beaconPool: "0", beaconTarget: "0", startBlock: 0 };
    },
    async getCurrentBlockNumber() {
      return 100;
    }
  });
  const snap = await readWorld(client, { agentId: 1 });
  assert.equal(snap.fsmState, snap.state);
  assert.deepEqual(snap.fsmAllowedActions, snap.allowedActions);
  assert.ok(snap.fsmConfig && typeof snap.fsmConfig.criticalEnergy === "number");
});
