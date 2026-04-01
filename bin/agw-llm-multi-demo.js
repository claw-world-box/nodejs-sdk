#!/usr/bin/env node

/**
 * 并行跑多个独立 agent 的 LLM 自动游玩（每个账户链上只能有 1 个活跃 agent，需不同私钥）。
 *
 * 环境变量（与 agw-llm-demo 共用 SUBSTRATE_WS_URL、OPENAI_*、AGW_LLM_* 等）：
 * - AGW_ETH_PRIVKEYS   逗号分隔的 0x 私钥列表（优先）
 * - 或 AGW_ETH_PRIVKEY_1 / _2 / _3 … 依次填写
 * - AGW_AGENT_IDS      可选，逗号分隔，与私钥顺序一一对应；空或 \"-\" 表示该账户自动注册；缺省则全部自动注册
 * - AGW_LLM_LABELS     可选，逗号分隔日志前缀，如 Alpha,Beta,Gamma
 * - AGW_LLM_SHORT_RULES 设为 true 时用短规则文本，省 token（多 agent / 大半径时建议开）
 */

import { readFile } from "node:fs/promises";
import { AgwGameClient } from "../src/index.js";
import { AUTPLAY_PROMPT_RULES_SHORT, runAutoplayLoop } from "../src/llm/index.js";

function envBool(name, defaultValue = true) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return defaultValue;
  if (["0", "false", "no", "off"].includes(v)) return false;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  return defaultValue;
}

function envTrue(name) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(v);
}

function parseCommaEnv(name) {
  return String(process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function collectPrivateKeys() {
  const inline = parseCommaEnv("AGW_ETH_PRIVKEYS");
  if (inline.length) return inline;
  const out = [];
  for (let i = 1; i <= 32; i += 1) {
    const k = String(process.env[`AGW_ETH_PRIVKEY_${i}`] ?? "").trim();
    if (!k) break;
    out.push(k);
  }
  return out;
}

function collectAgentIds(keyCount) {
  const raw = String(process.env.AGW_AGENT_IDS ?? "").trim();
  if (!raw) {
    return Array.from({ length: keyCount }, () => null);
  }
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length !== keyCount) {
    console.error(`AGW_AGENT_IDS 应有 ${keyCount} 个字段（与私钥数相同），用空或 - 表示自动注册`);
    process.exit(1);
  }
  return parts.map((t) => {
    if (!t || t === "-") return null;
    const n = Number(t);
    if (!Number.isFinite(n)) {
      console.error(`无效的 AGW_AGENT_IDS 项: ${t}`);
      process.exit(1);
    }
    return n;
  });
}

function collectLabels(count) {
  const raw = parseCommaEnv("AGW_LLM_LABELS");
  while (raw.length < count) {
    raw.push(`#${raw.length + 1}`);
  }
  return raw.slice(0, count);
}

async function resolveChainSpec() {
  const inline = String(process.env.AGW_SMOLDOT_CHAIN_SPEC ?? "").trim();
  if (inline) return inline;
  const path = String(process.env.AGW_SMOLDOT_CHAIN_SPEC_PATH ?? "").trim();
  if (!path) return null;
  return (await readFile(path, "utf8")).trim();
}

async function main() {
  const keys = collectPrivateKeys();
  if (keys.length < 2) {
    console.error(
      "需要至少 2 把私钥（链上每个 owner 只能有 1 个活跃 agent）。设置 AGW_ETH_PRIVKEYS=a,b,c 或 AGW_ETH_PRIVKEY_1 / _2 / _3"
    );
    process.exit(1);
  }

  const chainSpec = await resolveChainSpec();
  const agentIds = collectAgentIds(keys.length);

  const labels = collectLabels(keys.length);
  const radius = Number(process.env.AGW_LLM_RADIUS ?? 2);
  const intervalMs = Number(process.env.AGW_LLM_INTERVAL_MS ?? 4000);
  const maxIterations = Number(process.env.AGW_LLM_MAX_ITERATIONS ?? 8);
  const useTools = envBool("AGW_LLM_USE_TOOLS", true);
  const temperature =
    process.env.OPENAI_TEMPERATURE != null && String(process.env.OPENAI_TEMPERATURE).trim() !== ""
      ? Number(process.env.OPENAI_TEMPERATURE)
      : undefined;

  const clients = keys.map((ethPrivateKey, i) => {
    const aid = agentIds[i];
    return {
      label: labels[i],
      ethPrivateKey,
      agentId: aid,
      client: new AgwGameClient({
        connectionMode: process.env.AGW_CONNECTION_MODE ?? (chainSpec ? "smoldot" : "ws"),
        wsUrl: process.env.SUBSTRATE_WS_URL ?? "ws://127.0.0.1:9944",
        evmRpcUrl: process.env.AGW_EVM_RPC_URL ?? process.env.SUBSTRATE_WS_URL ?? "ws://127.0.0.1:9944",
        smoldotChainSpec: chainSpec,
        smoldotChainSpecUrl: process.env.AGW_SMOLDOT_CHAIN_SPEC_URL ?? null,
        smoldotBootnodes: process.env.AGW_SMOLDOT_BOOTNODES ?? process.env.AGW_SMOLDOT_BOOTNODE ?? "",
        signerUri: process.env.AGW_SIGNER_URI ?? null,
        ethPrivateKey,
        agentId: aid
      })
    };
  });

  for (const row of clients) {
    await row.client.connect();
    console.log(`[${row.label}] connected:`, row.client.connectionMode);
  }

  for (const row of clients) {
    if (row.client.agentId === null) {
      const registered = await row.client.registerWithRandomSpawn();
      row.client.agentId = registered.agentId;
      console.log(`[${row.label}] registered agent:`, registered.agentId, registered.position);
    } else {
      console.log(`[${row.label}] using existing agent:`, row.client.agentId);
    }
  }

  const loops = clients.map((row) =>
    runAutoplayLoop(row.client, {
      agentId: row.client.agentId,
      radius,
      intervalMs,
      maxIterations,
      path: process.env.AGW_ACTION_PATH ?? "auto",
      systemPrompt: envTrue("AGW_LLM_SHORT_RULES") ? AUTPLAY_PROMPT_RULES_SHORT : undefined,
      useTools,
      temperature,
      baseUrl: process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:1234/v1",
      apiKey: process.env.OPENAI_API_KEY ?? "",
      model: process.env.OPENAI_MODEL ?? "gpt-4.1",
      onStep(step) {
        const others =
          Array.isArray(step?.snapshot?.agents) && step.snapshot.agents.length
            ? step.snapshot.agents
                .filter((a) => a && Number(a.id) !== Number(step?.snapshot?.me?.id))
                .map((a) => a.id)
                .slice(0, 6)
            : [];
        const occ = Array.isArray(step?.snapshot?.cells)
          ? step.snapshot.cells.flatMap((c) =>
              (c.occupants ?? []).filter((id) => id != null && Number(id) !== Number(step?.snapshot?.me?.id))
            )
          : [];
        console.log(
          `[${row.label} agent=${row.client.agentId}]`,
          JSON.stringify(
            {
              action: step?.llm?.parsed?.action ?? null,
              payload: step?.llm?.parsed?.payload ?? null,
              submitted: step?.submitted ?? null,
              otherAgentsInSnapshot: others.length ? others : undefined,
              otherOccupantsNearby: occ.length ? [...new Set(occ.map(String))].slice(0, 8) : undefined
            },
            (_key, value) => (typeof value === "bigint" ? value.toString() : value)
          )
        );
      },
      onError(error) {
        console.error(`[${row.label} agent=${row.client.agentId}] [error]`, error.message);
      }
    })
  );

  await Promise.all(loops);

  for (const row of clients) {
    await row.client.disconnect();
  }
  console.log("all agents disconnected");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
