import { Wallet } from "ethers";

/**
 * Create a random Ethereum wallet (for AGW account keys).
 * @returns {{ privateKey: string, address: string, mnemonic: string|null }}
 */
export function createRandomEthWallet() {
  const w = Wallet.createRandom();
  return {
    privateKey: w.privateKey,
    address: w.address,
    mnemonic: w.mnemonic?.phrase ?? null
  };
}

/**
 * Create a wallet-like object from a hex private key (`0x` + 64 hex chars).
 * @param {string} privateKey
 * @returns {{ privateKey: string, address: string, mnemonic: null }}
 */
export function walletFromPrivateKey(privateKey) {
  const w = new Wallet(String(privateKey ?? "").trim());
  return {
    privateKey: w.privateKey,
    address: w.address,
    mnemonic: null
  };
}
