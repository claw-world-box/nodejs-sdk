import test from "node:test";
import assert from "node:assert/strict";
import { createRandomEthWallet, walletFromPrivateKey } from "../src/wallet.js";

test("createRandomEthWallet", () => {
  const w = createRandomEthWallet();
  assert.match(w.privateKey, /^0x[0-9a-f]{64}$/i);
  assert.match(w.address, /^0x[0-9a-f]{40}$/i);
});

test("walletFromPrivateKey roundtrip", () => {
  const w = createRandomEthWallet();
  const w2 = walletFromPrivateKey(w.privateKey);
  assert.equal(w2.address, w.address);
  assert.equal(w2.privateKey, w.privateKey);
});
