import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createRandomEthWallet, walletFromPrivateKey } from "./wallet.js";

const STORE_VERSION = 1;

/**
 * @typedef {object} StoredWalletRecord
 * @property {number} version
 * @property {string} address
 * @property {string} privateKey
 * @property {string} createdAt
 * @property {string} networkPreset
 * @property {number|null|undefined} lastRegisteredAgentId
 */

/**
 * Default AGW config directory (Node).
 * - Linux: ~/.config/agw
 * - macOS: ~/Library/Application Support/agw
 * - Windows: %APPDATA%/agw
 */
export function getDefaultAgwConfigDir() {
  const h = homedir();
  if (process.platform === "darwin") {
    return join(h, "Library", "Application Support", "agw");
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || join(h, "AppData", "Roaming");
    return join(appData, "agw");
  }
  return join(h, ".config", "agw");
}

/**
 * @param {object} [opts]
 * @param {string} [opts.configDir]
 * @param {string} [opts.fileName] default `default-wallet.json`
 * @returns {string} absolute path to wallet file
 */
export function resolveWalletFilePath(opts = {}) {
  const dir = opts.configDir ?? getDefaultAgwConfigDir();
  const fileName = opts.fileName ?? "default-wallet.json";
  return join(dir, fileName);
}

/**
 * @param {string} jsonPath
 * @returns {StoredWalletRecord}
 */
function parseStoredWallet(jsonPath) {
  const raw = readFileSync(jsonPath, "utf8");
  /** @type {StoredWalletRecord} */
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object") throw new Error("wallet file: invalid JSON");
  if (Number(data.version) !== STORE_VERSION) {
    throw new Error(`wallet file: unsupported version ${data.version}`);
  }
  if (!data.privateKey || !data.address) {
    throw new Error("wallet file: missing address or privateKey");
  }
  return data;
}

/**
 * Save wallet to disk. Refuses to overwrite unless `overwrite: true`.
 * @param {{ privateKey: string, address: string, mnemonic?: string|null }} wallet
 * @param {object} [opts]
 * @param {string} [opts.configDir]
 * @param {string} [opts.fileName]
 * @param {string} [opts.networkPreset] default `mainnet`
 * @param {number|null} [opts.lastRegisteredAgentId]
 * @param {boolean} [opts.overwrite]
 * @returns {{ path: string, record: StoredWalletRecord }}
 */
export function saveWalletToDisk(wallet, opts = {}) {
  const jsonPath = resolveWalletFilePath(opts);
  const dir = dirname(jsonPath);
  try {
    if (statSync(jsonPath).isFile() && !opts.overwrite) {
      throw new Error(
        `wallet file already exists: ${jsonPath} (pass { overwrite: true } to replace)`
      );
    }
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code !== "ENOENT") throw e;
  }

  mkdirSync(dir, { recursive: true, mode: 0o700 });

  /** @type {StoredWalletRecord} */
  const record = {
    version: STORE_VERSION,
    address: String(wallet.address),
    privateKey: String(wallet.privateKey),
    createdAt: new Date().toISOString(),
    networkPreset: opts.networkPreset ?? "mainnet",
    lastRegisteredAgentId:
      opts.lastRegisteredAgentId === undefined ? null : opts.lastRegisteredAgentId
  };

  writeFileSync(jsonPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  return { path: jsonPath, record };
}

/**
 * @param {object} [opts]
 * @param {string} [opts.configDir]
 * @param {string} [opts.fileName]
 * @returns {{ path: string, record: StoredWalletRecord, wallet: { privateKey: string, address: string, mnemonic: null } }}
 */
export function loadWalletFromDisk(opts = {}) {
  const jsonPath = resolveWalletFilePath(opts);
  const record = parseStoredWallet(jsonPath);
  const wallet = walletFromPrivateKey(record.privateKey);
  if (wallet.address.toLowerCase() !== String(record.address).toLowerCase()) {
    throw new Error("wallet file: address does not match private key");
  }
  return { path: jsonPath, record, wallet };
}

/**
 * Load existing wallet file or create a new random wallet and save it.
 * @param {object} [opts]
 * @param {string} [opts.configDir]
 * @param {string} [opts.fileName]
 * @param {string} [opts.networkPreset]
 * @param {boolean} [opts.overwrite] only used when creating new file
 * @returns {{ path: string, record: StoredWalletRecord, wallet: { privateKey: string, address: string, mnemonic: string|null }, created: boolean }}
 */
export function ensureWallet(opts = {}) {
  const jsonPath = resolveWalletFilePath(opts);
  try {
    const loaded = loadWalletFromDisk(opts);
    return { ...loaded, created: false, wallet: { ...loaded.wallet, mnemonic: null } };
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code !== "ENOENT") throw e;
  }
  const w = createRandomEthWallet();
  const { path, record } = saveWalletToDisk(w, {
    ...opts,
    overwrite: opts.overwrite ?? true
  });
  return {
    path,
    record,
    wallet: w,
    created: true
  };
}

/**
 * Update `lastRegisteredAgentId` in an existing wallet file (atomic write via temp + rename optional: keep simple).
 * @param {string} jsonPath
 * @param {number|null} agentId
 */
export function updateLastRegisteredAgentId(jsonPath, agentId) {
  const record = parseStoredWallet(jsonPath);
  record.lastRegisteredAgentId = agentId == null ? null : Number(agentId);
  writeFileSync(jsonPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
}
