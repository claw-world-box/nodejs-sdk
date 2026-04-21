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

test("readWorld default omits relations", async () => {
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
  assert.equal(snap.relations, undefined);
  assert.equal(snap.relationsError, undefined);
});

test("readWorld includeRelations adds snapshot when EVM and mocks succeed", async () => {
  const addr2 = "0x2222222222222222222222222222222222222222";
  let gr = 0;
  let st = 0;
  let rel = 0;
  const client = {
    ...minimalClient({
      async getAgent(id) {
        if (id === 1) return baseAgent({ id: 1 });
        return baseAgent({
          id: 2,
          owner: addr2,
          position: { x: 6, y: 5 },
          hp: 50,
          hpMax: 50,
          energy: "50"
        });
      },
      async watchSurroundings() {
        return [{ x: 5, y: 5, terrain: "Plain", occupants: 0 }];
      },
      async getNearbyAgents() {
        return [
          { ...baseAgent({ id: 1 }), distance: 0 },
          {
            ...baseAgent({ id: 2, owner: addr2, position: { x: 6, y: 5 }, hp: 50, hpMax: 50, energy: "50" }),
            distance: 1
          }
        ];
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
    }),
    async getGlobalReputation() {
      gr += 1;
      return 7;
    },
    async getStanding() {
      st += 1;
      return 10;
    },
    async getRelation() {
      rel += 1;
      return "Allied";
    }
  };
  const snap = await readWorld(client, { agentId: 1, includeRelations: true });
  assert.equal(snap.relations.globalReputation, 7);
  assert.equal(snap.relations.peers.length, 1);
  assert.equal(snap.relations.peers[0].agentId, 2);
  assert.equal(snap.relations.peers[0].standing, 10);
  assert.equal(snap.relations.peers[0].attitude, "Allied");
  assert.equal(gr, 1);
  assert.equal(st, 1);
  assert.equal(rel, 1);
  assert.deepEqual(snap.allowedActions, ["move", "harvest"]);
});

test("readWorld includeRelations keeps partial peers when one peer lookup throws", async () => {
  const addr2 = "0x2222222222222222222222222222222222222222";
  const addr3 = "0x3333333333333333333333333333333333333333";
  const client = {
    ...minimalClient({
      async getAgent(id) {
        if (id === 1) return baseAgent({ id: 1 });
        if (id === 2) {
          return baseAgent({
            id: 2,
            owner: addr2,
            position: { x: 6, y: 5 },
            hp: 50,
            hpMax: 50,
            energy: "50"
          });
        }
        return baseAgent({
          id: 3,
          owner: addr3,
          position: { x: 7, y: 5 },
          hp: 40,
          hpMax: 40,
          energy: "40"
        });
      },
      async watchSurroundings() {
        return [{ x: 5, y: 5, terrain: "Plain", occupants: 0 }];
      },
      async getNearbyAgents() {
        return [
          { ...baseAgent({ id: 1 }), distance: 0 },
          {
            ...baseAgent({
              id: 2,
              owner: addr2,
              position: { x: 6, y: 5 },
              hp: 50,
              hpMax: 50,
              energy: "50"
            }),
            distance: 1
          },
          {
            ...baseAgent({
              id: 3,
              owner: addr3,
              position: { x: 7, y: 5 },
              hp: 40,
              hpMax: 40,
              energy: "40"
            }),
            distance: 2
          }
        ];
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
    }),
    async getGlobalReputation() {
      return 99;
    },
    async getStanding(_me, peer) {
      if (peer === addr3) throw new Error("rpc flake");
      return 10;
    },
    async getRelation(_me, peer) {
      if (peer === addr3) throw new Error("should not reach if standing failed first");
      return "Allied";
    }
  };
  const snap = await readWorld(client, { agentId: 1, includeRelations: true });
  assert.equal(snap.relations.globalReputation, 99);
  assert.equal(snap.relations.peers.length, 2);
  const p2 = snap.relations.peers.find((p) => p.agentId === 2);
  const p3 = snap.relations.peers.find((p) => p.agentId === 3);
  assert.equal(p2.standing, 10);
  assert.equal(p2.attitude, "Allied");
  assert.equal(p3.standing, null);
  assert.equal(p3.attitude, null);
  assert.match(p3.error, /rpc flake/);
  assert.equal(snap.relationsError, undefined);
});

test("readWorld includeRelations without evm sets relationsError", async () => {
  const client = minimalClient({
    canUseEvm: false,
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
  const snap = await readWorld(client, { agentId: 1, includeRelations: true });
  assert.equal(snap.relations, null);
  assert.match(snap.relationsError, /evmRpcUrl/);
});

test("readWorld InRuin from center cell terrain Ruin", async () => {
  const client = minimalClient({
    async getAgent(id) {
      return baseAgent({ id, nativeBalance: 200n * WEI_PER_AGW });
    },
    async watchSurroundings() {
      return [{ x: 5, y: 5, terrain: "Ruin", occupants: 0 }];
    },
    async getNearbyAgents() {
      return [];
    },
    async getRuin() {
      return { level: 1, hp: 10, maxHp: 10 };
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
  assert.equal(snap.state, "InRuin");
});

test("readWorld Recover after Critical when balance below exit threshold", async () => {
  let nativeBalance = 100n * WEI_PER_AGW;
  const client = minimalClient({
    async getAgent(id) {
      return baseAgent({ id, nativeBalance, energy: String(nativeBalance / WEI_PER_AGW) });
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
  let snap = await readWorld(client, { agentId: 1 });
  assert.equal(snap.state, "Critical");
  nativeBalance = 180n * WEI_PER_AGW;
  snap = await readWorld(client, { agentId: 1 });
  assert.equal(snap.state, "Recover");
});

test("readWorld Combat when center cell has multiple occupants", async () => {
  const client = minimalClient({
    async getAgent(id) {
      return baseAgent({ id, nativeBalance: 200n * WEI_PER_AGW });
    },
    async watchSurroundings() {
      return [{ x: 5, y: 5, terrain: "Plain", occupants: 2 }];
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
  assert.equal(snap.state, "Combat");
});

test("readWorld falls back to agent distances when cells omit occupants", async () => {
  const client = minimalClient({
    async getAgent(id) {
      return baseAgent({ id, nativeBalance: 200n * WEI_PER_AGW });
    },
    async watchSurroundings() {
      return [{ x: 5, y: 5, terrain: "Plain" }];
    },
    async getNearbyAgents() {
      return [{ ...baseAgent({ id: 2, position: { x: 6, y: 5 }, nativeBalance: 50n * WEI_PER_AGW }), distance: 1 }];
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
  assert.equal(snap.state, "Combat");
});

test("readWorld does not pick Scout while recovering HP", async () => {
  const client = minimalClient({
    async getAgent(id) {
      return baseAgent({
        id,
        hp: 50,
        hpMax: 100,
        nativeBalance: 200n * WEI_PER_AGW
      });
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
  assert.equal(snap.state, "Explore");
});
