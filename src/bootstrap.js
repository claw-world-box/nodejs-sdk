import { AgwFaucetClient } from "./faucet.js";
import { AgwGameClient } from "./client.js";
import { ensureWallet, updateLastRegisteredAgentId } from "./wallet-store.js";

/**
 * One-shot: ensure wallet on disk → (faucet if needed) → connect → register if needed.
 * If the wallet file already has `lastRegisteredAgentId`, skips faucet + register and only connects.
 *
 * @param {object} [options]
 * @param {string} [options.configDir]
 * @param {string} [options.walletFileName]
 * @param {string} [options.networkPreset] passed to `AgwGameClient`
 * @param {ConstructorParameters<typeof AgwFaucetClient>[0]} [options.faucet] faucet client options
 * @param {object} [options.registerOptions] passed to `registerWithRandomSpawn`
 * @param {object} [options.clientOptions] extra `AgwGameClient` constructor fields
 * @param {boolean} [options.forceClaim] if true, always call faucet even when session already has an agent id
 * @param {boolean} [options.forceRegister] if true, call `registerWithRandomSpawn` even when wallet already has `lastRegisteredAgentId`
 * @param {(cfg: object) => AgwGameClient} [options.createClient] test hook; default `cfg => new AgwGameClient(cfg)`
 * @param {(address: string) => Promise<unknown>} [options.claimFaucet] test hook; default uses `AgwFaucetClient`
 * @returns {Promise<{
 *   wallet: { privateKey: string, address: string, mnemonic: string|null },
 *   walletPath: string,
 *   client: AgwGameClient,
 *   agentId: number|null,
 *   registration: object|null,
 *   createdWallet: boolean,
 *   skippedRegistration: boolean,
 *   skippedFaucet: boolean
 * }>}
 */
export async function bootstrapRegistration(options = {}) {
  const walletOpts = {
    configDir: options.configDir,
    fileName: options.walletFileName ?? options.fileName
  };

  const createClient =
    typeof options.createClient === "function" ? options.createClient : (cfg) => new AgwGameClient(cfg);

  const ensured = ensureWallet(walletOpts);
  const wallet = ensured.wallet;
  const walletPath = ensured.path;
  const record = ensured.record;

  const hasAgent =
    record.lastRegisteredAgentId != null && Number.isFinite(Number(record.lastRegisteredAgentId));

  let skippedFaucet = false;
  let skippedRegistration = false;

  if (!hasAgent || options.forceClaim) {
    if (typeof options.claimFaucet === "function") {
      await options.claimFaucet(wallet.address);
    } else {
      const faucet = new AgwFaucetClient(options.faucet ?? {});
      await faucet.claim(wallet.address);
    }
  } else {
    skippedFaucet = true;
  }

  const client = createClient({
    ethPrivateKey: wallet.privateKey,
    networkPreset: options.networkPreset ?? record.networkPreset ?? "mainnet",
    agentId: hasAgent && !options.forceRegister ? Number(record.lastRegisteredAgentId) : null,
    ...options.clientOptions
  });

  await client.connect();

  /** @type {object|null} */
  let registration = null;

  const shouldRegister = !hasAgent || options.forceRegister === true;

  if (!shouldRegister) {
    client.agentId = Number(record.lastRegisteredAgentId);
    skippedRegistration = true;
  } else {
    registration = await client.registerWithRandomSpawn(options.registerOptions ?? {});
    client.agentId = registration.agentId ?? client.agentId;
    updateLastRegisteredAgentId(walletPath, client.agentId);
  }

  return {
    wallet,
    walletPath,
    client,
    agentId: client.agentId,
    registration,
    createdWallet: ensured.created,
    skippedRegistration,
    skippedFaucet
  };
}
