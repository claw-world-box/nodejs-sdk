#!/usr/bin/env node

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

async function main() {
  const chainSpec = await resolveChainSpec();
  const client = new AgwGameClient({
    connectionMode: process.env.AGW_CONNECTION_MODE ?? (chainSpec ? "smoldot" : "ws"),
    wsUrl: process.env.SUBSTRATE_WS_URL ?? "ws://127.0.0.1:9944",
    evmRpcUrl: process.env.AGW_EVM_RPC_URL ?? process.env.SUBSTRATE_WS_URL ?? "ws://127.0.0.1:9944",
    smoldotChainSpec: chainSpec,
    smoldotChainSpecUrl: process.env.AGW_SMOLDOT_CHAIN_SPEC_URL ?? null,
    smoldotBootnodes: process.env.AGW_SMOLDOT_BOOTNODES ?? process.env.AGW_SMOLDOT_BOOTNODE ?? "",
    signerUri: process.env.AGW_SIGNER_URI ?? null,
    ethPrivateKey: process.env.AGW_ETH_PRIVKEY ?? null,
    agentId: process.env.AGW_AGENT_ID ? Number(process.env.AGW_AGENT_ID) : null
  });

  await client.connect();
  console.log("connected:", client.connectionMode);

  if (client.agentId === null) {
    const registered = await client.registerWithRandomSpawn();
    client.agentId = registered.agentId;
    console.log("registered agent:", registered.agentId, registered.position);
  }

  await runAutoplayLoop(client, {
    agentId: client.agentId,
    radius: Number(process.env.AGW_LLM_RADIUS ?? 2),
    intervalMs: Number(process.env.AGW_LLM_INTERVAL_MS ?? 8000),
    maxIterations: Number(process.env.AGW_LLM_MAX_ITERATIONS ?? 50),
    path: process.env.AGW_ACTION_PATH ?? "auto",
    systemPrompt: envTrue("AGW_LLM_SHORT_RULES") ? AUTPLAY_PROMPT_RULES_SHORT : undefined,
    useTools: envBool("AGW_LLM_USE_TOOLS", true),
    temperature:
      process.env.OPENAI_TEMPERATURE != null && String(process.env.OPENAI_TEMPERATURE).trim() !== ""
        ? Number(process.env.OPENAI_TEMPERATURE)
        : undefined,
    baseUrl: process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:1234/v1",
    apiKey: process.env.OPENAI_API_KEY ?? "",
    model: process.env.OPENAI_MODEL ?? "gpt-4.1",
    onStep(step) {
      console.log(
        "[step]",
        JSON.stringify(
          {
            action: step?.llm?.parsed?.action ?? null,
            payload: step?.llm?.parsed?.payload ?? null,
            submitted: step?.submitted ?? null
          },
          (_key, value) => (typeof value === "bigint" ? value.toString() : value)
        )
      );
    },
    onError(error) {
      console.error("[error]", error.message);
    }
  });

  await client.disconnect();
}

async function resolveChainSpec() {
  const inline = String(process.env.AGW_SMOLDOT_CHAIN_SPEC ?? "").trim();
  if (inline) return inline;
  const path = String(process.env.AGW_SMOLDOT_CHAIN_SPEC_PATH ?? "").trim();
  if (!path) return null;
  return (await readFile(path, "utf8")).trim();
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
