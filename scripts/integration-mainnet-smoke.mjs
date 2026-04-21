#!/usr/bin/env node
/**
 * Joint smoke: `bootstrapRegistration` → optional NPC ticks (import from `agw-game-sdk/fsm-client`).
 * Uses an isolated temp wallet dir unless `AGW_WALLET_DIR` is set.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapRegistration } from "../src/index.js";
import { AgwFsmNpcClient } from "../src/fsm-client.js";

const ticks = Math.max(1, Math.min(20, Number(process.env.AGW_NPC_TICKS ?? 4) || 4));
const intervalMs = Number(process.env.AGW_NPC_INTERVAL_MS ?? 3000);

const walletDir = process.env.AGW_WALLET_DIR ?? mkdtempSync(join(tmpdir(), "agw-smoke-"));
const walletFileName = process.env.AGW_WALLET_FILE ?? "smoke-wallet.json";

console.log("[bootstrap] wallet dir", walletDir, "file", walletFileName);

const out = await bootstrapRegistration({
  configDir: walletDir,
  walletFileName,
  registerOptions: { maxAttempts: 50 }
});

console.log("[bootstrap] agentId", out.agentId, "walletPath", out.walletPath, "skippedFaucet", out.skippedFaucet);

const npc = new AgwFsmNpcClient(out.client, {
  intervalMs,
  maxIterations: ticks,
  onStep: (s) => {
    console.log("tick", s.iteration, s.decision?.action, s.recentResult?.ok);
  },
  onError: (e) => console.error("npc error", e)
});

await npc.start();
await out.client.disconnect();
console.log("done.");
