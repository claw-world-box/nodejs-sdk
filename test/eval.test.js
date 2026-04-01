import test from "node:test";
import assert from "node:assert/strict";
import { collectFailureSamples, evaluateModelOutput } from "../src/eval.js";

test("evaluateModelOutput normalizes corpus aliases", () => {
  const result = evaluateModelOutput("CALL: `transfer_with_msg(to='0x1', amount=1, payload='hi')`", ["transfer"]);
  assert.equal(result.ok, true);
  assert.equal(result.canonical, "transfer");
  assert.equal(result.aliasUsed, true);
});

test("collectFailureSamples catches unsupported actions", () => {
  const failures = collectFailureSamples([
    { output: 'CALL: `destroy_world()`' },
    { output: '{"action":"move","payload":{"direction":"North"}}' }
  ], ["move"]);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].canonical, "destroy_world");
});

test("evaluateModelOutput accepts Transaction [NONE]", () => {
  const out = "<Thought>\n1. 余额不足。\n</Thought>\n\n<Transaction>\n[NONE]\n</Transaction>\n\n主人，先打钱。";
  const result = evaluateModelOutput(out);
  assert.equal(result.ok, true);
  assert.equal(result.reason, "explicit refuse");
});

test("evaluateModelOutput handles missing action without throwing", () => {
  const result = evaluateModelOutput("只有叙事，没有 CALL 也没有 JSON action。");
  assert.equal(result.ok, false);
  assert.equal(result.candidate, "");
});
