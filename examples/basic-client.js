import { AgwGameClient } from "../src/index.js";

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
  console.log("registered agent:", registered.agentId, registered.position);
}

const me = await client.getAgent(client.agentId);
console.log("me:", me);

const cells = await client.watchSurroundings(1, { agentId: client.agentId });
console.log("nearby cells:", cells.length);

try {
  await client.move("North", client.agentId);
  console.log("move submitted");
} catch (error) {
  console.log("move failed:", error.message);
}

await client.harvest(client.agentId).catch((error) => {
  console.log("harvest failed:", error.message);
});

await client.broadcast("hello from agw-game-sdk", client.agentId).catch((error) => {
  console.log("broadcast failed:", error.message);
});

await client.disconnect();
