import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeRelationAttitude,
  int256LikeToNumber,
  normalizeOwnerToAddress
} from "../src/relations.js";

test("normalizeOwnerToAddress accepts H160", () => {
  assert.equal(
    normalizeOwnerToAddress("0xAbCdEf0123456789aBcDeF0123456789aBcDeF01"),
    "0xabcdef0123456789abcdef0123456789abcdef01"
  );
});

test("normalizeOwnerToAddress rejects non-hex or wrong length", () => {
  assert.equal(normalizeOwnerToAddress("alice"), null);
  assert.equal(normalizeOwnerToAddress("0x1234"), null);
  assert.equal(normalizeOwnerToAddress(null), null);
});

test("decodeRelationAttitude maps 0/1/2", () => {
  assert.equal(decodeRelationAttitude(0), "Neutral");
  assert.equal(decodeRelationAttitude(1n), "Allied");
  assert.equal(decodeRelationAttitude(2), "Hostile");
});

test("decodeRelationAttitude throws on invalid", () => {
  assert.throws(() => decodeRelationAttitude(3), /invalid relation attitude/);
});

test("int256LikeToNumber small signed", () => {
  assert.equal(int256LikeToNumber(-3n), -3);
  assert.equal(int256LikeToNumber(42n), 42);
});
