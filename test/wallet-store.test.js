import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureWallet,
  getDefaultAgwConfigDir,
  loadWalletFromDisk,
  resolveWalletFilePath,
  saveWalletToDisk,
  updateLastRegisteredAgentId
} from "../src/wallet-store.js";
import { createRandomEthWallet } from "../src/wallet.js";

test("getDefaultAgwConfigDir returns non-empty path", () => {
  assert.ok(getDefaultAgwConfigDir().length > 0);
});

test("resolveWalletFilePath uses configDir and fileName", () => {
  const p = resolveWalletFilePath({ configDir: "/tmp/x", fileName: "w.json" });
  assert.equal(p, "/tmp/x/w.json");
});

test("saveWalletToDisk refuses overwrite by default", () => {
  const dir = mkdtempSync(join(tmpdir(), "agw-ws-"));
  const w = createRandomEthWallet();
  saveWalletToDisk(w, { configDir: dir, fileName: "a.json" });
  assert.throws(() => saveWalletToDisk(w, { configDir: dir, fileName: "a.json" }), /already exists/);
  rmSync(dir, { recursive: true, force: true });
});

test("ensureWallet creates then loads same address", () => {
  const dir = mkdtempSync(join(tmpdir(), "agw-ws-"));
  const first = ensureWallet({ configDir: dir, fileName: "w.json" });
  assert.equal(first.created, true);
  const second = ensureWallet({ configDir: dir, fileName: "w.json" });
  assert.equal(second.created, false);
  assert.equal(second.wallet.address, first.wallet.address);
  updateLastRegisteredAgentId(first.path, 42);
  const third = loadWalletFromDisk({ configDir: dir, fileName: "w.json" });
  assert.equal(third.record.lastRegisteredAgentId, 42);
  rmSync(dir, { recursive: true, force: true });
});
