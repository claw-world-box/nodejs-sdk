import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAutoplayPrompt,
  buildCompactPrompt,
  parseModelAction,
  requestOpenAiCompatibleDecisionWithTools,
  sanitizeModelOutput
} from "../src/llm/index.js";
import { AGW_TOOLS, executeTool } from "../src/llm/tools.js";

test("buildAutoplayPrompt includes actions and snapshot", () => {
  const prompt = buildAutoplayPrompt({
    allowedActions: ["move", "harvest"],
    snapshot: { me: { id: 1 } }
  });
  assert.match(prompt, /move, harvest/);
  assert.match(prompt, /"id": 1/);
});

test("parseModelAction reads fenced json", () => {
  const parsed = parseModelAction("```json\n{\"action\":\"move\",\"payload\":{\"direction\":\"North\"},\"reason\":\"explore\"}\n```", ["move"]);
  assert.equal(parsed.action, "move");
  assert.equal(parsed.payload.direction, "North");
});

test("parseModelAction rejects unsupported action", () => {
  assert.throws(
    () => parseModelAction("{\"action\":\"destroy_world\",\"payload\":{},\"reason\":\"nope\"}", ["move"]),
    /unsupported action/
  );
});

test("buildCompactPrompt includes guidance and compact snapshot", () => {
  const prompt = buildCompactPrompt({
    snapshot: {
      me: { id: 9, hp: 80, hpMax: 100, position: { x: 1, y: 2 } },
      cells: [{ x: 1, y: 2, terrain: "Plain" }],
      allowedActions: ["move", "harvest"]
    },
    allowedActions: ["move", "harvest"],
    guidanceNote: "prefer harvesting in safe cells",
    memorySummary: "avoid combat while low hp",
    chatTail: [{ role: "user", text: "be careful" }]
  });
  assert.match(prompt, /Soft guidance/);
  assert.match(prompt, /prefer harvesting/);
  assert.match(prompt, /"id": 9/);
});

test("sanitizeModelOutput falls back on invalid output", () => {
  const out = sanitizeModelOutput("invalid json", ["harvest", "move"], "harvest");
  assert.equal(out.ok, false);
  assert.equal(out.parsed.action, "harvest");
});

// --- Tool execution tests (mock client) ---

function createMockClient(overrides = {}) {
  return {
    agentId: 1,
    async readWorld(opts) {
      return overrides.readWorld?.(opts) ?? { me: { id: opts?.agentId ?? 1 }, cells: [], allowedActions: ["move", "harvest"] };
    },
    async getAgent(id) {
      return overrides.getAgent?.(id) ?? { id: id ?? 1, x: 0, y: 0 };
    },
    async watchSurroundings(radius, opts) {
      return overrides.watchSurroundings?.(radius, opts) ?? [];
    },
    async submitAction(input) {
      if (overrides.submitAction) return overrides.submitAction(input);
      return { status: "ok", blockHash: "0xab", events: [] };
    }
  };
}

test("AGW_TOOLS tool count matches definitions", () => {
  assert.equal(AGW_TOOLS.length, 21);
  const names = AGW_TOOLS.map((t) => t.function.name);
  assert.ok(names.includes("move"));
  assert.ok(names.includes("read_world"));
  assert.ok(names.includes("get_messages"));
  assert.ok(names.includes("get_agent"));
  assert.ok(names.includes("watch_surroundings"));
});

test("executeTool read_world calls client.readWorld and returns snapshot", async () => {
  const snapshot = { me: { id: 2 }, cells: [], allowedActions: ["harvest"] };
  const client = createMockClient({ readWorld: () => Promise.resolve(snapshot) });
  const out = await executeTool(client, { agentId: 2, radius: 3 }, "read_world", { radius: 3 });
  assert.equal(out.ok, true);
  assert.deepEqual(out.result.me.id, 2);
  assert.equal(out.result.allowedActions[0], "harvest");
});

test("executeTool get_agent calls client.getAgent", async () => {
  const client = createMockClient({ getAgent: (id) => Promise.resolve({ id, x: 1, y: 2 }) });
  const out = await executeTool(client, { agentId: 1 }, "get_agent", { agentId: 5 });
  assert.equal(out.ok, true);
  assert.equal(out.result.id, 5);
  assert.equal(out.result.x, 1);
});

test("executeTool watch_surroundings calls client.watchSurroundings", async () => {
  const cells = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  const client = createMockClient({ watchSurroundings: () => Promise.resolve(cells) });
  const out = await executeTool(client, { agentId: 1, radius: 2 }, "watch_surroundings", { radius: 2 });
  assert.equal(out.ok, true);
  assert.equal(out.result.length, 2);
});

test("executeTool move builds payload and calls submitAction", async () => {
  let captured;
  const client = createMockClient({
    submitAction: (input) => {
      captured = input;
      return Promise.resolve({ status: "ok", blockHash: "0x1", events: [] });
    }
  });
  const out = await executeTool(client, { agentId: 1, path: "auto" }, "move", { direction: "South" });
  assert.equal(out.ok, true);
  assert.equal(captured.action, "move");
  assert.equal(captured.payload.direction, "South");
  assert.equal(out.submitted.status, "ok");
});

test("executeTool unknown tool returns error", async () => {
  const client = createMockClient();
  const out = await executeTool(client, {}, "destroy_world", {});
  assert.equal(out.ok, false);
  assert.match(out.error, /unknown tool/);
});

test("executeTool rejects action not in allowedActions", async () => {
  const client = createMockClient();
  const out = await executeTool(client, { agentId: 1, allowedActions: ["harvest"] }, "move", { direction: "North" });
  assert.equal(out.ok, false);
  assert.match(out.error, /not allowed/);
});

test("executeTool submitAction throw returns ok:false", async () => {
  const client = createMockClient({
    submitAction: () => Promise.reject(new Error("chain error"))
  });
  const out = await executeTool(client, { agentId: 1 }, "harvest", {});
  assert.equal(out.ok, false);
  assert.equal(out.error, "chain error");
});

// --- requestOpenAiCompatibleDecisionWithTools with mock fetch ---

test("requestOpenAiCompatibleDecisionWithTools runs tool loop and returns lastAction", async () => {
  const submittedStub = { status: "ok", blockHash: "0xab", events: [] };
  const client = createMockClient({ submitAction: () => Promise.resolve(submittedStub) });

  let callCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    callCount += 1;
    const body = JSON.parse(opts?.body ?? "{}");
    const messages = body.messages ?? [];

    if (callCount === 1) {
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: "tc_1",
                      function: { name: "read_world", arguments: "{}" }
                    },
                    {
                      id: "tc_2",
                      function: { name: "move", arguments: '{"direction":"East"}' }
                    }
                  ]
                }
              }
            ]
          })
      };
    }

    if (callCount === 2) {
      const hasToolResults = messages.some((m) => m.role === "tool");
      assert.ok(hasToolResults, "second request must include tool results");
      const toolMessages = messages.filter((m) => m.role === "tool");
      assert.equal(toolMessages.length, 2);
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "Done.", tool_calls: undefined } }]
          })
      };
    }

    return { ok: false };
  };

  try {
    const result = await requestOpenAiCompatibleDecisionWithTools(
      {
        baseUrl: "https://test/v1",
        model: "test-model",
        snapshot: {},
        recentResult: null
      },
      client,
      { agentId: 1, path: "auto", radius: 2 }
    );
    assert.equal(result.lastAction, "move");
    assert.equal(result.lastSubmitted?.status, "ok");
    assert.equal(result.toolCalls?.length, 2);
    assert.equal(result.toolCalls[0].name, "read_world");
    assert.equal(result.toolCalls[1].name, "move");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestOpenAiCompatibleDecisionWithTools accepts custom userPrompt", async () => {
  const client = createMockClient();
  const originalFetch = globalThis.fetch;
  let capturedBody;
  globalThis.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts?.body ?? "{}");
    return {
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "done", tool_calls: undefined } }]
        })
    };
  };
  try {
    await requestOpenAiCompatibleDecisionWithTools(
      {
        baseUrl: "https://test/v1",
        model: "test-model",
        userPrompt: "custom compact prompt"
      },
      client,
      { agentId: 1 }
    );
    assert.equal(capturedBody?.messages?.[1]?.content, "custom compact prompt");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestOpenAiCompatibleDecisionWithTools filters tools", async () => {
  const client = createMockClient();
  const originalFetch = globalThis.fetch;
  let capturedBody;
  globalThis.fetch = async (_url, opts) => {
    capturedBody = JSON.parse(opts?.body ?? "{}");
    return {
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "done", tool_calls: undefined } }]
        })
    };
  };
  try {
    await requestOpenAiCompatibleDecisionWithTools(
      {
        baseUrl: "https://test/v1",
        model: "test-model",
        allowedReadTools: ["read_world"],
        allowedActionTools: ["move"]
      },
      client,
      { agentId: 1 }
    );
    const toolNames = (capturedBody?.tools ?? []).map((t) => t.function?.name);
    assert.deepEqual(toolNames.sort(), ["move", "read_world"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestOpenAiCompatibleDecisionWithTools respects maxToolRounds", async () => {
  const client = createMockClient();
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async (_url, opts) => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: "tc_1",
                      function: { name: "read_world", arguments: "{}" }
                    }
                  ]
                }
              }
            ]
          })
      };
    }
    return {
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "done", tool_calls: undefined } }]
        })
    };
  };
  try {
    await requestOpenAiCompatibleDecisionWithTools(
      {
        baseUrl: "https://test/v1",
        model: "test-model",
        maxToolRounds: 1
      },
      client,
      { agentId: 1 }
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
