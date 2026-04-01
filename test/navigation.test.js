import test from "node:test";
import assert from "node:assert/strict";
import { legalDirectionsFromGridPosition } from "../src/utils.js";

test("legalDirectionsFromGridPosition corners on 256x256", () => {
  assert.deepEqual(legalDirectionsFromGridPosition(0, 0, 256, 256).sort(), ["East", "North"].sort());
  assert.deepEqual(legalDirectionsFromGridPosition(255, 0, 256, 256).sort(), ["North", "West"].sort());
  assert.deepEqual(legalDirectionsFromGridPosition(0, 255, 256, 256).sort(), ["East", "South"].sort());
  assert.deepEqual(legalDirectionsFromGridPosition(255, 255, 256, 256).sort(), ["South", "West"].sort());
});

test("legalDirectionsFromGridPosition interior has all four", () => {
  assert.deepEqual(legalDirectionsFromGridPosition(10, 10, 256, 256).sort(), ["East", "North", "South", "West"].sort());
});
