/**
 * 演示：一键注册宏 `bootstrapRegistration`，或已有会话时用 `connectRegisteredSession`。
 * 可选环境变量：`AGW_WALLET_DIR`、`AGW_WALLET_FILE`（覆盖默认 ~/.config/agw 与 default-wallet.json）。
 */
import { bootstrapRegistration, connectRegisteredSession } from "../src/index.js";

const useResumeOnly = process.env.AGW_RESUME_ONLY === "1";

let client;
let agentId;

if (useResumeOnly) {
  const session = await connectRegisteredSession();
  client = session.client;
  agentId = session.agentId;
  console.log("resumed session agentId:", agentId);
} else {
  const out = await bootstrapRegistration({
    configDir: process.env.AGW_WALLET_DIR,
    walletFileName: process.env.AGW_WALLET_FILE
  });
  client = out.client;
  agentId = out.agentId;
  console.log("bootstrap:", {
    agentId: out.agentId,
    walletPath: out.walletPath,
    skippedFaucet: out.skippedFaucet,
    skippedRegistration: out.skippedRegistration
  });
}

const me = await client.getAgent(agentId);
console.log("me:", me);

const cells = await client.watchSurroundings(1, { agentId });
console.log("nearby cells:", cells.length);

try {
  await client.move("North", agentId);
  console.log("move submitted");
} catch (error) {
  console.log("move failed:", error.message);
}

await client.harvest(agentId).catch((error) => {
  console.log("harvest failed:", error.message);
});

await client.broadcast("hello from agw-game-sdk", agentId).catch((error) => {
  console.log("broadcast failed:", error.message);
});

await client.disconnect();
