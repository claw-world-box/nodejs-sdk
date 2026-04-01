import { AgwGameClient } from "../src/index.js";
import { runAutoplayLoop } from "../src/llm/index.js";

const client = new AgwGameClient({
  connectionMode: process.env.AGW_CONNECTION_MODE ?? "ws",
  wsUrl: process.env.SUBSTRATE_WS_URL ?? "ws://127.0.0.1:9944",
  evmRpcUrl: process.env.AGW_EVM_RPC_URL ?? process.env.SUBSTRATE_WS_URL ?? "ws://127.0.0.1:9944",
  smoldotChainSpec: process.env.AGW_SMOLDOT_CHAIN_SPEC ?? null,
  signerUri: process.env.AGW_SIGNER_URI ?? null,
  ethPrivateKey: process.env.AGW_ETH_PRIVKEY ?? null,
  agentId: process.env.AGW_AGENT_ID ? Number(process.env.AGW_AGENT_ID) : null
});

await client.connect();
if (client.agentId === null) {
  const registered = await client.registerWithRandomSpawn();
  client.agentId = registered.agentId;
}

await runAutoplayLoop(client, {
  agentId: client.agentId,
  radius: Number(process.env.AGW_LLM_RADIUS ?? 2),
  intervalMs: Number(process.env.AGW_LLM_INTERVAL_MS ?? 8000),
  maxIterations: Number(process.env.AGW_LLM_MAX_ITERATIONS ?? 20),
  baseUrl: process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:1234/v1",
  apiKey: process.env.OPENAI_API_KEY ?? "",
  model: process.env.OPENAI_MODEL ?? "gpt-4.1",
  onStep(step) {
    console.log("[autoplay]", JSON.stringify(step, null, 2));
  },
  onError(error) {
    console.error("[autoplay:error]", error.message);
  }
});

await client.disconnect();
