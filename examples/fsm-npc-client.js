/**
 * Rule-based NPC loop (no LLM, no local Rust gateway).
 * Prerequisites: funded account, connected client, registered agentId.
 *
 *   AGW_ETH_PRIVKEY=0x... node examples/fsm-npc-client.js
 */
import { AgwFsmNpcClient, AgwGameClient } from "../src/index.js";

const ethPrivateKey = process.env.AGW_ETH_PRIVKEY;
if (!ethPrivateKey) {
  console.error("Set AGW_ETH_PRIVKEY");
  process.exit(1);
}

const client = new AgwGameClient({
  connectionMode: "smoldot",
  networkPreset: "mainnet",
  ethPrivateKey,
  evmRpcUrl: process.env.AGW_EVM_RPC_URL ?? "ws://150.158.44.248:9944",
  agentId: process.env.AGW_AGENT_ID ? Number(process.env.AGW_AGENT_ID) : null
});

await client.connect();

if (client.agentId == null) {
  const reg = await client.registerWithRandomSpawn();
  console.log("registered", reg.agentId, reg.position);
}

const npc = new AgwFsmNpcClient(client, {
  intervalMs: Number(process.env.AGW_NPC_INTERVAL_MS ?? 8000),
  maxIterations: Number(process.env.AGW_NPC_MAX_ITERATIONS ?? 12),
  onStep: (step) => {
    console.log("npc step", step.iteration, step.decision?.action, step.recentResult?.ok);
  },
  onError: (e) => console.error("npc error", e)
});

await npc.start();
await client.disconnect();
