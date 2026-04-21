import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapRegistration } from "../src/bootstrap.js";
import { saveWalletToDisk } from "../src/wallet-store.js";
import { createRandomEthWallet } from "../src/wallet.js";

test("bootstrapRegistration with existing agent skips faucet and register", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agw-bs-"));
  const w = createRandomEthWallet();
  saveWalletToDisk(w, {
    configDir: dir,
    fileName: "w.json",
    overwrite: true,
    lastRegisteredAgentId: 7
  });

  let claims = 0;
  let registers = 0;
  const out = await bootstrapRegistration({
    configDir: dir,
    walletFileName: "w.json",
    claimFaucet: async () => {
      claims += 1;
    },
    createClient: () => ({
      connect: async () => {},
      registerWithRandomSpawn: async () => {
        registers += 1;
        return { agentId: 99 };
      },
      agentId: null
    })
  });

  assert.equal(claims, 0);
  assert.equal(registers, 0);
  assert.equal(out.skippedFaucet, true);
  assert.equal(out.skippedRegistration, true);
  assert.equal(out.agentId, 7);
  rmSync(dir, { recursive: true, force: true });
});

test("bootstrapRegistration new wallet claims and registers", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agw-bs-"));
  let claims = 0;
  const out = await bootstrapRegistration({
    configDir: dir,
    walletFileName: "new.json",
    claimFaucet: async () => {
      claims += 1;
    },
    createClient: () => {
      const o = {
        agentId: null,
        async connect() {},
        async registerWithRandomSpawn() {
          o.agentId = 3;
          return { agentId: 3, position: { x: 1, y: 2 } };
        }
      };
      return o;
    }
  });
  assert.equal(claims, 1);
  assert.equal(out.agentId, 3);
  assert.equal(out.skippedFaucet, false);
  assert.equal(out.skippedRegistration, false);
  rmSync(dir, { recursive: true, force: true });
});
