import test from "node:test";
import assert from "node:assert/strict";
import { GAME_RULES_SECTIONS, GAME_RULES_TEXT, buildRulesPrompt } from "../rules/index.js";

test("rules export contains all core sections", () => {
  assert.ok(GAME_RULES_SECTIONS.worldRules.length > 20);
  assert.ok(GAME_RULES_SECTIONS.llmSystemPrompt.length > 20);
  assert.ok(GAME_RULES_TEXT.includes("AGW"));
  assert.ok(GAME_RULES_TEXT.includes("North"));
  assert.ok(GAME_RULES_TEXT.includes("navigation.legalDirections"));
});

test("buildRulesPrompt appends extra text", () => {
  const prompt = buildRulesPrompt("Extra context");
  assert.match(prompt, /Extra context/);
});
