#!/usr/bin/env node
/**
 * One-tick LLM tool test: uses real OpenAI-compatible API with a mock client.
 * Verifies that the model receives tools, returns tool_calls, and we execute them correctly.
 *
 * Usage:
 *   OPENAI_BASE_URL=http://26.26.26.1:1234/v1 OPENAI_MODEL=qwen3.5-0.8b node scripts/test-llm-tools-live.js
 *   OPENAI_API_KEY=sk-... OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_MODEL=gpt-4o-mini node scripts/test-llm-tools-live.js
 */

import { requestOpenAiCompatibleDecisionWithTools } from "../src/llm/index.js";

const baseUrl = (process.env.OPENAI_BASE_URL ?? "http://26.26.26.1:1234/v1").replace(/\/$/, "");
const apiKey = process.env.OPENAI_API_KEY ?? "";
const model = process.env.OPENAI_MODEL ?? "qwen3.5-0.8b";
const maxToolRounds = process.env.AGW_MAX_TOOL_ROUNDS ? Number(process.env.AGW_MAX_TOOL_ROUNDS) : 8;

const mockSnapshot = {
  me: { id: 1, x: 0, y: 0, health: 100 },
  cells: [{ x: 0, y: 0, terrain: "grass", agents: [1] }],
  allowedActions: ["move", "harvest", "broadcast"]
};

function createMockClient() {
  const log = (method, ...args) => console.log("[mock]", method, ...args);
  return {
    agentId: 1,
    async readWorld(opts) {
      log("readWorld", opts);
      return { ...mockSnapshot, me: { ...mockSnapshot.me, id: opts?.agentId ?? 1 } };
    },
    async getAgent(id) {
      log("getAgent", id);
      return { id: id ?? 1, x: 0, y: 0, health: 100 };
    },
    async watchSurroundings(radius, opts) {
      log("watchSurroundings", radius, opts);
      return mockSnapshot.cells;
    },
    async submitAction(input) {
      log("submitAction", input.action, input.payload);
      return { status: "ok", blockHash: "0xmock", events: [] };
    }
  };
}

async function main() {
  if (!baseUrl || !model) {
    console.error("Need OPENAI_BASE_URL and OPENAI_MODEL (OPENAI_API_KEY required for OpenAI)");
    process.exit(1);
  }

  const client = createMockClient();
  const context = { agentId: 1, path: "auto", radius: 2 };

  console.log("Calling LLM with tools (one tick)...");
  console.log("baseUrl:", baseUrl, "model:", model);

  try {
    const result = await requestOpenAiCompatibleDecisionWithTools(
      {
        baseUrl,
        apiKey,
        model,
        snapshot: mockSnapshot,
        recentResult: null,
        maxToolRounds
      },
      client,
      context
    );

    console.log("\n--- Result ---");
    console.log("lastAction:", result.lastAction);
    console.log("lastSubmitted:", result.lastSubmitted);
    console.log("lastError:", result.lastError);
    console.log("toolCalls count:", result.toolCalls?.length ?? 0);
    if (result.toolCalls?.length) {
      result.toolCalls.forEach((tc, i) => {
        const r = tc.result;
        console.log(`  [${i}] ${tc.name} -> ok: ${r?.ok}, ${r?.error ? `error: ${r.error}` : ""}`);
      });
    }
    console.log("Tools flow OK.");
  } catch (err) {
    console.error("Error:", err.message ?? err);
    process.exit(1);
  }
}

main();
