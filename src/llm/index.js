import { DEFAULT_ALLOWED_ACTIONS } from "../constants.js";
import { normalizeCorpusAction } from "../utils.js";
import { GAME_RULES_TEXT } from "../../rules/index.js";
import { ACTION_TOOL_NAMES, AGW_TOOLS, READ_TOOL_NAMES, executeTool } from "./tools.js";

export { AGW_TOOLS, executeTool };

/** Shorter substitute for GAME_RULES_TEXT inside buildAutoplayPrompt (saves context for large snapshots). */
export const AUTPLAY_PROMPT_RULES_SHORT = [
  "AGW on-chain survival grid.",
  "Return JSON only: action, payload, reason; action must be in allowedActions.",
  "Terrain: Plain, Swamp, Mountain, Well, Ruin. Use snapshot cells, agents, and messages.",
  "Prefer survival, scout for information, broadcast to coordinate; avoid reckless combat when weak."
].join("\n");

const COMPACT_SYSTEM_RULES = [
  "You are controlling one AGW agent in a live on-chain world.",
  "Output exactly one safe, legal action in JSON with fields: action, payload, reason.",
  "Do not invent actions outside allowedActions.",
  "Prefer low-risk legal actions when uncertain."
].join("\n");

function compactSnapshot(snapshot, options = {}) {
  const maxCells = Number(options.maxCells ?? 25);
  const maxRuins = Number(options.maxRuins ?? 8);
  const maxMessages = Number(options.maxMessages ?? 8);
  const me = snapshot?.me ?? null;
  const cells = Array.isArray(snapshot?.cells) ? snapshot.cells : [];
  const ruins = Array.isArray(snapshot?.ruins) ? snapshot.ruins : [];
  return {
    blockNumber: snapshot?.blockNumber ?? null,
    me: me
      ? {
          id: me.id ?? null,
          position: me.position ?? null,
          hp: me.hp ?? null,
          hpMax: me.hpMax ?? null,
          nativeBalance: me.nativeBalance ?? null,
          energy: me.energy ?? null,
          status: me.status ?? null,
          tier: me.tier ?? null
        }
      : null,
    cells: cells.slice(0, maxCells).map((cell) => ({
      x: cell.x ?? null,
      y: cell.y ?? null,
      terrain: cell.terrain ?? null,
      structure: cell.structure ?? null,
      occupants: Array.isArray(cell.occupants) ? cell.occupants.slice(0, 5) : [],
      energy: cell.energy ?? null
    })),
    ruins: ruins.slice(0, maxRuins).map((ruin) => ({
      x: ruin.x ?? null,
      y: ruin.y ?? null,
      level: ruin.level ?? null,
      hp: ruin.hp ?? null,
      minAgents: ruin.minAgents ?? null
    })),
    epoch: snapshot?.epoch
      ? {
          index: snapshot.epoch.index ?? null,
          beaconPool: snapshot.epoch.beaconPool ?? null,
          beaconTarget: snapshot.epoch.beaconTarget ?? null,
          startBlock: snapshot.epoch.startBlock ?? null
        }
      : null,
    state: snapshot?.state ?? null,
    allowedActions: Array.isArray(snapshot?.allowedActions) ? snapshot.allowedActions : [],
    messages: Array.isArray(snapshot?.messages) ? snapshot.messages.slice(0, maxMessages) : [],
    agents: Array.isArray(snapshot?.agents) ? snapshot.agents.slice(0, maxCells) : []
  };
}

function truncateText(text, maxChars) {
  if (!Number.isFinite(maxChars) || maxChars <= 0) return text;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function serializeChatTail(chatTail, maxItems = 6) {
  if (!Array.isArray(chatTail) || chatTail.length === 0) return "";
  return chatTail
    .slice(-maxItems)
    .map((entry) => {
      const role = entry?.role === "assistant" ? "agent" : "player";
      return `${role}: ${String(entry?.text ?? "").slice(0, 240)}`;
    })
    .join("\n");
}

export function buildCompactPrompt(input = {}) {
  const allowedActions = Array.isArray(input.allowedActions) && input.allowedActions.length > 0
    ? input.allowedActions
    : DEFAULT_ALLOWED_ACTIONS;
  const compact = compactSnapshot(input.snapshot ?? {}, input);
  const serializedSnapshot = truncateText(
    safeJson(compact),
    Number(input.maxSnapshotChars ?? 2600)
  );
  const recent = input.recentResult ? safeJson(input.recentResult) : "null";
  const memorySummary = String(input.memorySummary ?? "").trim();
  const guidance = String(input.guidanceNote ?? "").trim();
  const chatTail = serializeChatTail(input.chatTail, Number(input.maxChatTail ?? 6));
  return [
    input.systemRules ?? COMPACT_SYSTEM_RULES,
    "",
    `Allowed actions: ${allowedActions.join(", ")}`,
    guidance ? `Soft guidance (ttl active): ${guidance}` : "Soft guidance: none",
    memorySummary ? `Memory summary: ${memorySummary}` : "Memory summary: none",
    chatTail ? `Recent chat:\n${chatTail}` : "Recent chat: none",
    "Last action result:",
    recent,
    "Compact world snapshot:",
    serializedSnapshot
  ].join("\n");
}

export function buildAutoplayPrompt(input) {
  const allowedActions = Array.isArray(input?.allowedActions) && input.allowedActions.length > 0
    ? input.allowedActions
    : DEFAULT_ALLOWED_ACTIONS;
  const recentResult = input?.recentResult ? safeJson(input.recentResult) : "null";
  const snapshot = safeJson(input?.snapshot ?? {});
  return [
    input?.systemPrompt ?? GAME_RULES_TEXT,
    "",
    input?.selectedScope ? `Selected scope: ${String(input.selectedScope)}` : "Selected scope: none",
    "",
    "You are controlling one AGW agent.",
    "Choose exactly one next action from the allowed action list.",
    "Return JSON only with fields: action, payload, reason.",
    "",
    `Allowed actions: ${allowedActions.join(", ")}`,
    "",
    "Last action result:",
    recentResult,
    "",
    "Current world snapshot:",
    snapshot
  ].join("\n");
}

function deriveRecoveryHint(errorCode) {
  const code = String(errorCode ?? "").trim().toUpperCase();
  if (!code) return "none";
  if (code === "INSUFFICIENT_ENERGY") return "prefer harvest/move to recover before expensive actions";
  if (code === "NOT_SAME_CELL") return "move first, then retry interaction on same cell";
  if (code === "INVALID_SCOUT_TARGET") return "pick visible nearby coordinates and retry scout";
  if (code === "CONTENT_TOO_LONG") return "shorten message or memo payload";
  if (code === "ACTION_NOT_ALLOWED") return "choose action strictly from allowedActions this turn";
  return "fallback to a conservative legal action";
}

/** User message content when using tools: snapshot + guidance + last result. */
function buildToolUserMessage(snapshot, recentResult, options = {}) {
  if (typeof snapshot === "string") {
    return snapshot;
  }
  const recent = recentResult != null ? safeJson(recentResult) : "null";
  const guidance = String(options.guidanceNote ?? "").trim();
  const memorySummary = String(options.memorySummary ?? "").trim();
  const chatTail = serializeChatTail(options.chatTail, Number(options.maxChatTail ?? 6));
  const errorCode = String(recentResult?.error_code ?? "");
  const recoveryHint = deriveRecoveryHint(errorCode);
  return [
    "You are controlling one AGW agent. Use the provided tools to read state and submit actions.",
    guidance ? `Soft guidance (ttl active): ${guidance}` : "Soft guidance: none",
    memorySummary ? `Memory summary: ${memorySummary}` : "Memory summary: none",
    chatTail ? `Recent chat:\n${chatTail}` : "Recent chat: none",
    `Last error code: ${errorCode || "none"}`,
    `Recovery hint: ${recoveryHint}`,
    "Current world snapshot (you can also call read_world, get_agent, watch_surroundings to refresh):",
    safeJson(snapshot),
    "",
    "Last action result:",
    recent
  ].join("\n");
}

export function parseModelAction(text, allowedActions = DEFAULT_ALLOWED_ACTIONS) {
  const parsed = JSON.parse(extractJson(String(text ?? "")));
  const action = normalizeCorpusAction(parsed?.action);
  if (!allowedActions.includes(action)) {
    throw new Error(`model chose unsupported action: ${action}`);
  }
  return {
    action,
    payload: parsed?.payload ?? {},
    reason: String(parsed?.reason ?? "")
  };
}

export function sanitizeModelOutput(rawText, allowedActions = DEFAULT_ALLOWED_ACTIONS, fallbackAction = "harvest") {
  try {
    return {
      ok: true,
      parsed: parseModelAction(rawText, allowedActions),
      error: null
    };
  } catch (error) {
    const safeFallback = allowedActions.includes(fallbackAction) ? fallbackAction : allowedActions[0] ?? "harvest";
    return {
      ok: false,
      parsed: {
        action: safeFallback,
        payload: safeFallback === "move" ? { direction: "North" } : {},
        reason: "fallback due to invalid model output"
      },
      error: String(error?.message ?? error)
    };
  }
}

export async function requestOpenAiCompatibleDecisionTwoStage(input) {
  const baseUrl = String(input?.baseUrl ?? "").replace(/\/$/, "");
  const apiKey = String(input?.apiKey ?? "");
  const model = String(input?.model ?? "");
  if (!baseUrl) throw new Error("baseUrl is required");
  if (!model) throw new Error("model is required");

  const scopeCatalog = Array.isArray(input?.ruleScopes) && input.ruleScopes.length > 0
    ? input.ruleScopes.map((item) => String(item))
    : ["explore", "combat", "economy", "social", "chat"];
  const stage1Json = await chatRequest(baseUrl, apiKey, {
    model,
    temperature: input?.temperature ?? 0.2,
    messages: [
      {
        role: "system",
        content: [
          "You are AGW stage1 planner.",
          "Choose the smallest useful scope for the next action.",
          "Return JSON only with fields: ruleScope, reason."
        ].join("\n")
      },
      {
        role: "user",
        content: [
          `Available scopes: ${scopeCatalog.join(", ")}`,
          "",
          input?.stage1Prompt ?? buildAutoplayPrompt(input)
        ].join("\n")
      }
    ]
  });
  const stage1Content = stage1Json?.choices?.[0]?.message?.content;
  if (!stage1Content) throw new Error("stage1 model returned empty content");
  const stage1Parsed = sanitizeStage1Reply(stage1Content, scopeCatalog);
  const stage2Input = {
    ...input,
    selectedScope: stage1Parsed.ruleScope,
    systemPrompt: input?.systemPrompt ?? GAME_RULES_TEXT,
    userPrompt: input?.userPrompt ?? buildAutoplayPrompt({ ...input, selectedScope: stage1Parsed.ruleScope })
  };
  const stage2 = await requestOpenAiCompatibleDecision(stage2Input);
  return {
    stage1: { raw: stage1Content, parsed: stage1Parsed },
    stage2
  };
}

function sanitizeStage1Reply(rawText, scopeCatalog) {
  try {
    const parsed = JSON.parse(extractJson(String(rawText ?? "")));
    return {
      ruleScope: normalizeStageScope(parsed?.ruleScope, scopeCatalog),
      reason: String(parsed?.reason ?? "")
    };
  } catch {
    return {
      ruleScope: scopeCatalog[0] ?? "explore",
      reason: "fallback due to invalid stage1 output"
    };
  }
}

function normalizeStageScope(value, scopeCatalog) {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return scopeCatalog[0] ?? "explore";
  const found = scopeCatalog.find((item) => String(item).toLowerCase() === text);
  return found ?? scopeCatalog[0] ?? "explore";
}

/** One chat request (no tool loop). */
async function chatRequest(baseUrl, apiKey, body) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`model request failed: ${response.status}${errBody ? ` ${errBody.slice(0, 200)}` : ""}`);
  }
  return response.json();
}

/**
 * Request decision with tools: send tools + user message, then loop: on tool_calls execute tools,
 * append assistant + tool messages, call again until no tool_calls. Returns last action tool result for the step.
 */
export async function requestOpenAiCompatibleDecisionWithTools(input, client, context) {
  const baseUrl = String(input?.baseUrl ?? "").replace(/\/$/, "");
  const apiKey = String(input?.apiKey ?? "");
  const model = String(input?.model ?? "");
  if (!baseUrl || !model) throw new Error("baseUrl and model are required");
  if (!client) throw new Error("client is required for tool mode");

  const systemContent = (input?.systemPrompt ?? GAME_RULES_TEXT) + "\n\nUse the AGW tools to read state and submit exactly one action per tick when ready.";
  const messages = [
    { role: "system", content: systemContent },
    {
      role: "user",
      content:
        typeof input?.userPrompt === "string" && input.userPrompt.trim()
          ? input.userPrompt
          : buildToolUserMessage(input?.snapshot ?? {}, input?.recentResult ?? null, input)
    }
  ];

  const allowedActions = Array.isArray(input?.allowedActionTools) && input.allowedActionTools.length > 0
    ? input.allowedActionTools
    : Array.isArray(input?.allowedActions) && input.allowedActions.length > 0
      ? input.allowedActions
      : DEFAULT_ALLOWED_ACTIONS;
  const allowedReadTools = Array.isArray(input?.allowedReadTools) && input.allowedReadTools.length > 0
    ? input.allowedReadTools
    : READ_TOOL_NAMES;
  const tools = filterTools({
    allowedReadTools,
    allowedActionTools: allowedActions
  });

  const body = {
    model,
    temperature: input?.temperature ?? 0.7,
    messages,
    tools,
    tool_choice: "auto"
  };

  let lastAction = null;
  let lastSubmitted = null;
  let lastError = null;
  let lastErrorCode = null;
  const allToolResults = [];
  const maxRoundsRaw = input?.maxToolRounds;
  const maxRoundsValue = maxRoundsRaw == null ? 2 : Number(maxRoundsRaw);
  const maxRounds = Number.isFinite(maxRoundsValue) && maxRoundsValue > 0 ? maxRoundsValue : null;
  let toolRoundCount = 0;

  while (true) {
    if (maxRounds != null && toolRoundCount >= maxRounds) break;
    const json = await chatRequest(baseUrl, apiKey, body);
    const message = json?.choices?.[0]?.message;
    if (!message) throw new Error("model returned no message");

    const toolCalls = message?.tool_calls;
    if (!toolCalls?.length) {
      break;
    }

    body.messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: toolCalls
    });

    for (const tc of toolCalls) {
      const name = tc.function?.name;
      let args = {};
      try {
        if (tc.function?.arguments) args = JSON.parse(tc.function.arguments);
      } catch (_) {}
      const result = await executeTool(client, { ...context, allowedActions }, name, args);
      allToolResults.push({ id: tc.id, name, result });
      if (result.submitted != null) {
        lastAction = name;
        lastSubmitted = result.submitted;
        lastError = result.ok ? null : result.error;
        lastErrorCode = result.ok ? null : result.error_code ?? "ACTION_EXEC_FAILED";
      }
      body.messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: safeJson(result)
      });
    }
    toolRoundCount += 1;
  }

  return {
    raw: body.messages[body.messages.length - 1]?.content ?? null,
    toolCalls: allToolResults,
    lastAction,
    lastSubmitted,
    lastError,
    lastErrorCode,
    parsed: lastAction ? { action: lastAction, payload: null, reason: "" } : null
  };
}

export async function requestOpenAiCompatibleDecision(input) {
  const baseUrl = String(input?.baseUrl ?? "").replace(/\/$/, "");
  const apiKey = String(input?.apiKey ?? "");
  const model = String(input?.model ?? "");
  if (!baseUrl) throw new Error("baseUrl is required");
  if (!model) throw new Error("model is required");

  const json = await chatRequest(baseUrl, apiKey, {
    model,
    temperature: input?.temperature ?? 0.7,
    messages: [
      { role: "system", content: "You are an AGW player agent. Output JSON only." },
      {
        role: "user",
        content:
          typeof input?.userPrompt === "string" && input.userPrompt.trim()
            ? input.userPrompt
            : buildAutoplayPrompt(input)
      }
    ]
  });

  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("model returned empty content");
  const sanitized = sanitizeModelOutput(content, input?.allowedActions ?? DEFAULT_ALLOWED_ACTIONS);
  return { raw: content, parsed: sanitized.parsed, sanitized };
}

export async function runAutoplayLoop(client, options = {}) {
  const intervalMs = Number(options.intervalMs ?? 8_000);
  const maxIterations = Number(options.maxIterations ?? Number.POSITIVE_INFINITY);
  const useTools = options.useTools !== false;
  const decisionMode = String(options.decisionMode ?? "single").toLowerCase();
  const onStep = options.onStep ?? (() => {});
  const onError = options.onError ?? (() => {});
  const contextBuilder = options.contextBuilder ?? null;
  const onDecisionInput = options.onDecisionInput ?? (() => {});
  const onRecentResult = options.onRecentResult ?? (() => {});
  const shouldContinue = options.shouldContinue ?? (() => true);
  let recentResult = options.initialRecentResult ?? null;
  let iterations = 0;

  while (iterations < maxIterations) {
    const keepRunning = await shouldContinue({
      iteration: iterations + 1,
      recentResult
    });
    if (keepRunning === false) {
      break;
    }

    iterations += 1;
    try {
      const snapshot = await client.readWorld({
        agentId: options.agentId ?? client.agentId,
        radius: options.radius ?? 2
      });
      const builtContext = contextBuilder
        ? await contextBuilder({
            iteration: iterations,
            snapshot,
            recentResult,
            allowedActions: snapshot.allowedActions ?? DEFAULT_ALLOWED_ACTIONS
          })
        : null;
      const allowedActions = snapshot.allowedActions ?? DEFAULT_ALLOWED_ACTIONS;
      const context = {
        agentId: snapshot.me?.id ?? options.agentId ?? client.agentId,
        path: options.path ?? "auto",
        radius: options.radius ?? 2,
        allowedActions
      };
      const decisionInput = {
        ...options,
        ...(builtContext ?? {}),
        snapshot,
        recentResult,
        allowedActions,
        maxToolRounds: options.maxToolRounds ?? 2
      };
      onDecisionInput({
        iteration: iterations,
        useTools,
        decisionInput: {
          systemPrompt: decisionInput.systemPrompt ?? null,
          userPrompt: decisionInput.userPrompt ?? null,
          maxToolRounds: decisionInput.maxToolRounds ?? null,
          allowedActions: decisionInput.allowedActions ?? snapshot.allowedActions
        },
        metrics: estimateDecisionInput(decisionInput, useTools)
      });

      let llmResult;
      if (useTools) {
        llmResult = await requestOpenAiCompatibleDecisionWithTools(
          decisionInput,
          client,
          context
        );
      } else if (decisionMode === "two-stage") {
        const twoStageResult = await requestOpenAiCompatibleDecisionTwoStage(decisionInput);
        llmResult = {
          ...twoStageResult.stage2,
          stage1: twoStageResult.stage1
        };
      } else {
        llmResult = await requestOpenAiCompatibleDecision(decisionInput);
      }

      let submitted;
      if (useTools && llmResult.lastAction != null) {
        submitted = llmResult.lastSubmitted;
        if (llmResult.lastError) {
          submitted = await fallbackAction(client, snapshot, {
            ...options,
            recentResult,
            allowedActions
          });
          recentResult = {
            ok: false,
            action: llmResult.lastAction,
            error: llmResult.lastError,
            error_code: llmResult.lastErrorCode ?? "ACTION_EXEC_FAILED",
            fallback: true,
            submitted: summarizeSubmitted(submitted)
          };
        } else {
          recentResult = {
            ok: true,
            action: llmResult.lastAction,
            error_code: null,
            fallback: false,
            submitted: llmResult.lastSubmitted
          };
        }
      } else if (useTools && llmResult.lastAction == null) {
        submitted = await fallbackAction(client, snapshot, {
          ...options,
          recentResult,
          allowedActions
        });
        recentResult = {
          ok: false,
          action: null,
          error: "no action tool called",
          error_code: "NO_ACTION_TOOL_CALLED",
          fallback: true,
          submitted: summarizeSubmitted(submitted)
        };
      } else {
        try {
          submitted = await client.submitAction({
            agentId: snapshot.me.id,
            action: llmResult.parsed.action,
            payload: llmResult.parsed.payload,
            path: options.path ?? "auto"
          });
          recentResult = {
            ok: true,
            action: llmResult.parsed.action,
            error_code: null,
            fallback: false,
            submitted: summarizeSubmitted(submitted)
          };
        } catch (error) {
          submitted = await fallbackAction(client, snapshot, {
            ...options,
            recentResult,
            allowedActions
          });
          recentResult = {
            ok: false,
            action: llmResult.parsed.action,
            error: String(error?.message ?? error),
            error_code: "ACTION_EXEC_FAILED",
            fallback: true,
            submitted: summarizeSubmitted(submitted)
          };
        }
      }

      onStep({
        iteration: iterations,
        snapshot,
        llm: llmResult,
        submitted: summarizeSubmitted(submitted),
        recentResult
      });
      onRecentResult(recentResult);
    } catch (error) {
      onError(error);
      recentResult = { ok: false, error: String(error?.message ?? error), error_code: "LOOP_ERROR" };
      onRecentResult(recentResult);
    }
    if (iterations < maxIterations && intervalMs > 0) {
      await sleep(intervalMs);
    }
  }
}

async function fallbackAction(client, snapshot, options) {
  const me = snapshot.me;
  const allowedActions = Array.isArray(options?.allowedActions) && options.allowedActions.length > 0
    ? options.allowedActions
    : snapshot.allowedActions ?? DEFAULT_ALLOWED_ACTIONS;
  const choice = chooseFallbackAction(allowedActions, options?.recentResult ?? null);
  try {
    return await client.submitAction({
      agentId: me.id,
      action: choice.action,
      payload: choice.payload ?? {},
      path: options.path ?? "auto"
    });
  } catch {
    const secondary = chooseFallbackAction(
      allowedActions,
      { error_code: "ACTION_EXEC_FAILED" }
    );
    return client.submitAction({
      agentId: me.id,
      action: secondary.action,
      payload: secondary.payload ?? {},
      path: options.path ?? "auto"
    });
  }
}

function chooseFallbackAction(allowedActions, recentResult) {
  const allowed = Array.isArray(allowedActions) && allowedActions.length > 0
    ? allowedActions
    : DEFAULT_ALLOWED_ACTIONS;
  const errorCode = String(recentResult?.error_code ?? "").toUpperCase();
  const preferMove = errorCode === "NOT_SAME_CELL";
  const preferHarvest = errorCode === "INSUFFICIENT_ENERGY";
  if (preferMove && allowed.includes("move")) {
    return { action: "move", payload: { direction: "North" } };
  }
  if (preferHarvest && allowed.includes("harvest")) {
    return { action: "harvest", payload: {} };
  }
  const order = [
    "harvest",
    "submit_heartbeat",
    "move",
    "broadcast",
    "renew",
    "build_wall",
    "demolish"
  ];
  for (const action of order) {
    if (allowed.includes(action)) {
      return { action, payload: buildFallbackPayload(action) };
    }
  }
  const fallback = allowed[0] ?? "harvest";
  return { action: fallback, payload: buildFallbackPayload(fallback) };
}

function buildFallbackPayload(action) {
  if (action === "move") return { direction: "North" };
  if (action === "broadcast") return { message: "fallback" };
  return {};
}

function filterTools({ allowedReadTools, allowedActionTools }) {
  const read = new Set((allowedReadTools ?? []).map((t) => String(t)));
  const action = new Set((allowedActionTools ?? []).map((t) => String(t)));
  return AGW_TOOLS.filter((tool) => {
    const name = tool?.function?.name;
    if (!name) return false;
    if (READ_TOOL_NAMES.includes(name)) return read.has(name);
    if (ACTION_TOOL_NAMES.includes(name)) return action.has(name);
    return false;
  });
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(value) {
  return JSON.stringify(
    value,
    (_key, raw) => (typeof raw === "bigint" ? raw.toString() : raw),
    2
  );
}

function summarizeSubmitted(submitted) {
  if (!submitted || typeof submitted !== "object") return submitted ?? null;
  return {
    status: submitted.status ?? null,
    blockHash: submitted.blockHash ?? null,
    eventCount: Array.isArray(submitted.events) ? submitted.events.length : null
  };
}

function estimateDecisionInput(input, useTools) {
  const systemPrompt = String(input?.systemPrompt ?? GAME_RULES_TEXT);
  const userPrompt =
    typeof input?.userPrompt === "string" && input.userPrompt.trim()
      ? input.userPrompt
      : buildAutoplayPrompt(input);
  let approxChars = systemPrompt.length + userPrompt.length;
  if (useTools) {
    approxChars += safeJson(AGW_TOOLS).length;
  }
  return {
    approxChars,
    approxTokens: Math.ceil(approxChars / 4)
  };
}
