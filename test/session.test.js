import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clientFromSavedSession, connectRegisteredSession, loadRegisteredSession } from "../src/session.js";
import { saveWalletToDisk } from "../src/wallet-store.js";
import { createRandomEthWallet } from "../src/wallet.js";

test("loadRegisteredSession reads agent id", () => {
  const dir = mkdtempSync(join(tmpdir(), "agw-sess-"));
  const w = createRandomEthWallet();
  saveWalletToDisk(w, {
    configDir: dir,
    fileName: "w.json",
    overwrite: true,
    lastRegisteredAgentId: 5
  });
  const s = loadRegisteredSession({ configDir: dir, fileName: "w.json" });
  assert.equal(s.agentId, 5);
  assert.equal(s.networkPreset, "mainnet");
  rmSync(dir, { recursive: true, force: true });
});

test("connectRegisteredSession builds client", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agw-sess-"));
  const w = createRandomEthWallet();
  saveWalletToDisk(w, {
    configDir: dir,
    fileName: "w.json",
    overwrite: true,
    lastRegisteredAgentId: 9
  });
  const { client, session } = await connectRegisteredSession({
    configDir: dir,
    fileName: "w.json",
    clientOptions: {},
    createClient: (cfg) => {
      assert.equal(cfg.agentId, 9);
      return { connect: async () => {}, ...cfg };
    }
  });
  assert.equal(session.agentId, 9);
  assert.ok(client);
  rmSync(dir, { recursive: true, force: true });
});

test("connectRegisteredSession requires agent id", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agw-sess-"));
  const w = createRandomEthWallet();
  saveWalletToDisk(w, { configDir: dir, fileName: "w.json", overwrite: true });
  await assert.rejects(
    () =>
      connectRegisteredSession({
        configDir: dir,
        fileName: "w.json",
        createClient: () => ({ connect: async () => {} })
      }),
    /bootstrapRegistration/
  );
  rmSync(dir, { recursive: true, force: true });
});

test("clientFromSavedSession", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agw-sess-"));
  const w = createRandomEthWallet();
  saveWalletToDisk(w, {
    configDir: dir,
    fileName: "w.json",
    overwrite: true,
    lastRegisteredAgentId: 2
  });
  const c = await clientFromSavedSession({
    configDir: dir,
    fileName: "w.json",
    createClient: () => ({ connect: async () => {}, agentId: 2 })
  });
  assert.ok(c);
  rmSync(dir, { recursive: true, force: true });
});
