import test from "node:test";
import assert from "node:assert/strict";
import { AgwFsmNpcClient } from "../src/fsm-client.js";

test("AgwFsmNpcClient stop aborts loop", async () => {
  let reads = 0;
  const client = {
    agentId: 1,
    async readWorld() {
      reads += 1;
      return {
        me: { id: 1, position: { x: 0, y: 0 }, hp: 100, hpMax: 100, nativeBalance: 1n },
        state: "Explore",
        fsmState: "Explore",
        fsmAllowedActions: ["harvest", "move"],
        allowedActions: ["harvest", "move"],
        navigation: { legalDirections: ["North"] },
        agents: [],
        cells: [{ x: 0, y: 0, terrain: "Plain", occupants: 0 }],
        messages: [],
        ruins: [],
        epoch: { index: 0 }
      };
    },
    async submitAction(input) {
      assert.equal(input.action, "harvest");
      return { ok: true };
    }
  };
  const npc = new AgwFsmNpcClient(client, {
    intervalMs: 0,
    maxIterations: 100,
    shouldContinue: ({ iteration }) => iteration <= 3
  });
  const p = npc.start();
  assert.equal(npc.running, true);
  await p;
  assert.equal(reads, 3);
});
