#!/usr/bin/env node
/**
 * Joint smoke test: SDK defaults → smoldot mainnet → wallet → faucet → register → NPC ticks.
 * No env vars required (optional AGW_NPC_TICKS to override tick count).
 */
import {
  AgwFsmNpcClient,
  AgwGameClient,
  AgwFaucetClient,
  createRandomEthWallet
} from "../src/index.js";

const ticks = Math.max(1, Math.min(20, Number(process.env.AGW_NPC_TICKS ?? 4) || 4));
const intervalMs = Number(process.env.AGW_NPC_INTERVAL_MS ?? 3000);

console.log("[1/6] createRandomEthWallet");
const wallet = createRandomEthWallet();
console.log("      address", wallet.address);

console.log("[2/6] faucet claim");
const faucet = new AgwFaucetClient();
let claimOut;
try {
  claimOut = await faucet.claim(wallet.address);
  console.log("      claim ok", JSON.stringify(claimOut).slice(0, 200));
} catch (e) {
  console.error("      FATAL faucet:", e?.message ?? e);
  process.exit(2);
}

console.log("[3/6] AgwGameClient (defaults: smoldot + networkPreset mainnet, no spec)");
const client = new AgwGameClient({
  ethPrivateKey: wallet.privateKey
});

console.log("[4/6] connect() — smoldot may take 1–5+ minutes first sync…");
const t0 = Date.now();
try {
  await client.connect();
  console.log("      connected in", Math.round((Date.now() - t0) / 1000), "s");
} catch (e) {
  console.error("      FATAL connect:", e?.message ?? e);
  process.exit(3);
}

console.log("[5/6] registerWithRandomSpawn");
let reg;
try {
  reg = await client.registerWithRandomSpawn();
  console.log("      agentId", reg.agentId, "position", reg.position);
} catch (e) {
  console.error("      FATAL register:", e?.message ?? e);
  await client.disconnect().catch(() => {});
  process.exit(4);
}

console.log("[6/6] AgwFsmNpcClient", ticks, "ticks interval", intervalMs, "ms");
const npc = new AgwFsmNpcClient(client, {
  maxIterations: ticks,
  intervalMs,
  onStep: (s) => {
    console.log(
 "      tick",
      s.iteration,
      "action",
      s.decision?.action,
      "ok",
      s.recentResult?.ok
    );
  },
  onError: (e) => console.error("      step error", e?.message ?? e)
});

try {
  await npc.start();
} catch (e) {
  console.error("      FATAL npc:", e?.message ?? e);
}

await client.disconnect().catch(() => {});
console.log("done.");
